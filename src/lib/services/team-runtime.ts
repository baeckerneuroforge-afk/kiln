import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  ApprovalRequestStatus,
  Prisma,
  TeamExecutionStatus,
  TeamExecutionTaskStatus,
  type AgentTeamRole,
} from "@prisma/client";
import {
  getClaudeClient,
  getClaudeClientWithKey,
  getModelDef,
  MODEL_PROVIDER_MAP,
} from "@/lib/ai";
import { deductCredits, getCreditCost } from "@/lib/credits";
import { decrypt } from "@/lib/encryption";
import { sendTeamApprovalRequestEmail } from "@/lib/email-notifications";
import { emitEvent } from "@/lib/events";
import { estimateCost } from "@/lib/model-pricing";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunksMulti } from "@/lib/rag";
import {
  getExecutionContextMeta,
  setExecutionContextMeta,
  setTaskRuntimeMeta,
  stripExecutionContextMeta,
  type TeamExecutionRuntimeStrategy,
} from "@/lib/team-execution-metadata";
import {
  normalizeApprovalGateConfig,
} from "@/lib/team-approval";
import {
  buildTools,
  executeChatTool,
  type CustomToolDef,
} from "@/lib/services/action-service";
import {
  type AgentIntegrationInfo,
  isWriteTool,
  executeApprovedWriteTool,
} from "@/lib/services/integration-tools";
import {
  buildScopedMemoryWhere,
  formatMemoryPrompt,
  normalizeWorkflowMemoryScope,
} from "@/lib/workflow-memory-scope";
// TODO: Wire getRoleMCPTools for MCP tool filtering per team role
// import { getRoleMCPTools } from "@/lib/mcp/team-mcp-config";

const teamExecutionRuntimeInclude = {
  members: {
    include: {
      agent: {
        include: {
          knowledgeBases: { where: { embeddingStatus: "READY" } },
          actions: true,
          customTools: true,
          channels: { select: { id: true } },
          integrations: {
            where: { enabled: true },
            include: {
              integration: {
                select: { id: true, provider: true, config: true, isActive: true },
              },
            },
          },
        },
      },
      fallbackAgent: {
        include: {
          knowledgeBases: { where: { embeddingStatus: "READY" } },
          actions: true,
          customTools: true,
          channels: { select: { id: true } },
          integrations: {
            where: { enabled: true },
            include: {
              integration: {
                select: { id: true, provider: true, config: true, isActive: true },
              },
            },
          },
        },
      },
    },
    orderBy: { level: "asc" as const },
  },
} satisfies Prisma.AgentTeamInclude;

export type TeamExecutionRuntimeTeam = Prisma.AgentTeamGetPayload<{
  include: typeof teamExecutionRuntimeInclude;
}>;

export type TeamSharedContext = Record<string, unknown>;

export interface TeamExecutionTaskInput {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  assignedToId: string | null;
  taskIndex: number;
}

interface PriorExecutionOutput {
  taskIndex: number;
  title: string;
  output: string;
  memberName?: string;
}

interface TeamTaskResult {
  output: string;
  structuredOutput: TeamSharedContext;
  model: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
}

export interface FeedbackLoopConfig {
  targetMemberId: string;
  maxIterations: number;
  qualityField: string;
  qualityThreshold: number;
}

function parseFeedbackLoop(config: unknown): FeedbackLoopConfig | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const c = config as Record<string, unknown>;
  if (!c.targetMemberId || !c.qualityField || typeof c.qualityThreshold !== "number") return null;
  return {
    targetMemberId: String(c.targetMemberId),
    maxIterations: typeof c.maxIterations === "number" ? c.maxIterations : 3,
    qualityField: String(c.qualityField),
    qualityThreshold: c.qualityThreshold,
  };
}

function evaluateQuality(
  structuredOutput: TeamSharedContext,
  qualityField: string,
  threshold: number
): { passed: boolean; score: number | null } {
  const value = structuredOutput[qualityField];
  if (value === undefined || value === null) {
    return { passed: false, score: null };
  }
  const score = typeof value === "number" ? value : Number(value);
  if (isNaN(score)) {
    return { passed: false, score: null };
  }
  return { passed: score >= threshold, score };
}

interface ExecuteTeamExecutionOptions {
  executionId: string;
  team: TeamExecutionRuntimeTeam;
  userId: string;
  goal: string;
  tasks: TeamExecutionTaskInput[];
  priorOutputs?: PriorExecutionOutput[];
  executionContext?: TeamSharedContext;
  initialCompletedTasks?: number;
  initialFailedTasks?: number;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function toPlainObject(value: unknown): TeamSharedContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as TeamSharedContext;
}

function getVisibleExecutionContext(context: TeamSharedContext) {
  return stripExecutionContextMeta(context);
}

function cleanContextDelta(
  input: unknown,
  currentContext: TeamSharedContext
): TeamSharedContext {
  const visibleContext = getVisibleExecutionContext(currentContext);
  const record = toPlainObject(input);
  const next: TeamSharedContext = {};

  for (const [key, value] of Object.entries(record)) {
    if (!key.trim()) continue;
    if (value === undefined) continue;
    if (JSON.stringify(visibleContext[key]) === JSON.stringify(value)) continue;
    next[key] = value;
  }

  return next;
}

function mergeExecutionContext(
  currentContext: TeamSharedContext,
  delta: TeamSharedContext
) {
  return {
    ...currentContext,
    ...delta,
  };
}

function getMemberMaxRetries(
  member: TeamExecutionRuntimeTeam["members"][number]
) {
  return typeof member.maxRetries === "number" && member.maxRetries >= 0
    ? member.maxRetries
    : 2;
}

function shouldStopOnFailure(team: TeamExecutionRuntimeTeam) {
  const config = toPlainObject(team.config);
  const execution = toPlainObject(config.execution);
  return execution.stopOnFailure === true;
}

function describeFallbackTarget(params: {
  agentName: string;
  model: string | null | undefined;
}) {
  if (!params.model) {
    return params.agentName;
  }

  const modelDef = getModelDef(params.model);
  return `${params.agentName} (${modelDef?.shortLabel || params.model})`;
}

export function getMemberDisplayName(
  member: TeamExecutionRuntimeTeam["members"][number] | null
) {
  if (!member) return "Unassigned";
  if (member.role === "APPROVAL_GATE") {
    const config =
      member.config && typeof member.config === "object" && !Array.isArray(member.config)
        ? (member.config as Record<string, unknown>)
        : null;
    return typeof config?.label === "string" && config.label.trim()
      ? config.label.trim()
      : "Approval Gate";
  }
  return member.agent?.name || "Unnamed agent";
}

function buildTaskInput(
  team: TeamExecutionRuntimeTeam,
  task: TeamExecutionTaskInput,
  member: TeamExecutionRuntimeTeam["members"][number] | null,
  previousOutputs: PriorExecutionOutput[],
  executionContext: TeamSharedContext
) {
  const sharedContext = getVisibleExecutionContext(executionContext);

  return {
    teamId: team.id,
    teamName: team.name,
    teamGoal: team.goal,
    task: {
      id: task.id,
      index: task.taskIndex,
      title: task.title,
      description: task.description,
      priority: task.priority,
    },
    assignedMember: member
      ? {
          id: member.id,
          role: member.role,
          responsibilities: member.responsibilities,
          agentId: member.agent?.id || null,
          agentName: getMemberDisplayName(member),
          mode: member.agent?.mode || null,
        }
      : null,
    sharedContext,
    previousOutputs: previousOutputs.map((item) => ({
      taskIndex: item.taskIndex,
      title: item.title,
      output: item.output,
      memberName: item.memberName,
    })),
  };
}

export function buildTaskMessage(
  goal: string,
  task: TeamExecutionTaskInput,
  member: TeamExecutionRuntimeTeam["members"][number],
  previousOutputs: PriorExecutionOutput[],
  executionContext: TeamSharedContext
) {
  const sharedContext = getVisibleExecutionContext(executionContext);
  const previousOutputText =
    previousOutputs.length > 0
      ? previousOutputs
          .sort((a, b) => a.taskIndex - b.taskIndex)
          .map(
            (output) => {
              const label = output.memberName
                ? `=== Results from ${output.memberName} (Task ${output.taskIndex + 1}: ${output.title}) ===`
                : `=== Task ${output.taskIndex + 1}: ${output.title} ===`;
              return `${label}\n${output.output.slice(0, 2000)}`;
            }
          )
          .join("\n\n")
      : "No previous task outputs yet.";

  const sharedContextText =
    Object.keys(sharedContext).length > 0
      ? JSON.stringify(sharedContext, null, 2)
      : "{}";

  return `You are executing a sub-task as part of the team workflow.

Overall team goal:
${goal}

Your assigned role:
${member.role}${member.responsibilities ? ` — ${member.responsibilities}` : ""}

Current sub-task:
Title: ${task.title}
Priority: ${task.priority}
Description: ${task.description || "No extra description provided."}

Shared team context:
${sharedContextText}

Outputs from previously completed tasks:
${previousOutputText}

Instructions:
- Complete only the current sub-task.
- IMPORTANT: Read and use the outputs from previous team members above. Build on their work — do not repeat what they already did.
- Return a practical, detailed result that the next team member can immediately build on.
- Be concrete and concise. Include all relevant data, findings, or artifacts.
- After completing your task, clearly state the key facts and data you produced so downstream agents can use them.
- If the task cannot be completed, clearly explain what is blocking it.`;
}

export function getRoleDirective(role: AgentTeamRole) {
  switch (role) {
    case "HEAD":
      return "You are the team lead. Focus on coordination, decision quality, and clarity for the next agent.";
    case "COORDINATOR":
      return "You are the team coordinator. Structure work clearly and unblock downstream execution.";
    case "REPORTER":
      return "You are the team reporter. Summarize outcomes, risks, and next steps crisply.";
    case "APPROVAL_GATE":
      return "You are a human approval checkpoint. Do not generate AI work.";
    case "EXECUTOR":
    default:
      return "You are the execution specialist. Deliver the assigned work directly and efficiently.";
  }
}

async function extractStructuredContextDelta(
  output: string,
  currentContext: TeamSharedContext
) {
  const visibleContext = getVisibleExecutionContext(currentContext);
  const trimmed = output.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return cleanContextDelta(parsed, visibleContext);
    }
  } catch {
    // Fall back to model-based extraction.
  }

  try {
    const claude = getClaudeClient();
    const response = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: `Extract only the newly learned factual fields from an agent output.

Return a valid JSON object only.
- Include only fields that are new or changed compared with the existing shared context.
- Prefer concise keys like visitorName, company, industry, budget, score, qualified, timeline.
- Use simple JSON values only: strings, numbers, booleans, arrays, or nested objects.
- If there is no new information, return {}.

Existing shared context:
${JSON.stringify(visibleContext, null, 2)}`,
      messages: [
        {
          role: "user",
          content: `Agent output:\n${trimmed.slice(0, 6000)}`,
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      return {};
    }

    return cleanContextDelta(
      JSON.parse(text.replace(/```json?\n?/g, "").replace(/```/g, "").trim()),
      visibleContext
    );
  } catch {
    return {};
  }
}

/** Baut Tools für ein Team-Mitglied basierend auf Agent-Daten + enabledActions */
function buildMemberTools(
  member: TeamExecutionRuntimeTeam["members"][number],
  agent: NonNullable<TeamExecutionRuntimeTeam["members"][number]["agent"]>
): { tools: Anthropic.Tool[]; integrations: AgentIntegrationInfo[] } {
  const agentIntegrations: AgentIntegrationInfo[] = (agent.integrations || [])
    .filter((ai) => ai.integration.isActive)
    .map((ai) => ({
      provider: ai.integration.provider,
      connectionId: ai.integration.id,
      encryptedConfig: ai.integration.config,
    }));

  const customTools: CustomToolDef[] = (agent.customTools || []).map((ct) => ({
    id: ct.id,
    name: ct.name,
    description: ct.description,
    method: ct.method,
    url: ct.url,
    headers: ct.headers,
    bodyTemplate: ct.bodyTemplate,
    responseMapping: ct.responseMapping,
  }));

  const stripeEnabled = (agent.channels || []).length > 0;

  let tools = buildTools(
    agent.actions || [],
    customTools,
    stripeEnabled,
    agentIntegrations
  );

  // Filter nach enabledActions falls konfiguriert
  const enabledActions = member.enabledActions || [];
  if (enabledActions.length > 0) {
    const allowed = new Set(enabledActions);
    tools = tools.filter((t) => allowed.has(t.name));
  }

  return { tools, integrations: agentIntegrations };
}

async function runTeamMemberTask(
  team: TeamExecutionRuntimeTeam,
  member: TeamExecutionRuntimeTeam["members"][number],
  task: TeamExecutionTaskInput,
  goal: string,
  previousOutputs: PriorExecutionOutput[],
  executionContext: TeamSharedContext,
  options?: {
    agentOverride?: TeamExecutionRuntimeTeam["members"][number]["agent"] | null;
    modelOverride?: string | null;
  }
): Promise<TeamTaskResult> {
  const agent = options?.agentOverride || member.agent;
  if (!agent) {
    throw new Error("This team member is not linked to an AI agent.");
  }

  const selectedModel =
    options?.modelOverride || agent.llmModel || "claude-sonnet-4-6";
  const modelProvider =
    MODEL_PROVIDER_MAP[selectedModel] || agent.modelProvider || "ANTHROPIC";

  // Per-Agent Budget Cap prüfen (maxCreditsPerRun)
  const maxCreditsPerRun = (agent as Record<string, unknown>).maxCreditsPerRun;
  if (typeof maxCreditsPerRun === "number" && maxCreditsPerRun > 0) {
    const estimatedCost = getCreditCost(selectedModel) * 3; // ~3 rounds avg
    if (estimatedCost > maxCreditsPerRun) {
      throw new Error(
        `Agent "${agent.name}" budget cap exceeded. Estimated cost: ${estimatedCost} credits, limit: ${maxCreditsPerRun} credits.`
      );
    }
  }

  let userApiKey: string | null = null;
  try {
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: {
        userId_provider: {
          userId: agent.userId,
          provider: modelProvider.toLowerCase(),
        },
      },
    });
    if (apiKeyRecord) {
      userApiKey = decrypt(apiKeyRecord.encryptedKey);
    }
  } catch {
    // Fall back to platform key where available.
  }

  const taskMessage = buildTaskMessage(
    goal,
    task,
    member,
    previousOutputs,
    executionContext
  );
  const visibleExecutionContext = getVisibleExecutionContext(executionContext);
  const workflowExecutionId =
    typeof executionContext._workflowExecutionId === "string"
      ? executionContext._workflowExecutionId
      : null;
  const memoryScope = normalizeWorkflowMemoryScope(executionContext._workflowMemoryScope);
  const memorySessionHash = workflowExecutionId || `team:${team.id}`;

  // Search both agent KB and team KB
  let knowledgeContext = "";
  const hasAgentKB = agent.knowledgeBases.length > 0;
  const teamHasKB = await prisma.knowledgeBase.count({
    where: { teamId: team.id, embeddingStatus: "READY" },
  }).catch(() => 0);

  if (hasAgentKB || teamHasKB > 0) {
    try {
      const chunks = await searchRelevantChunksMulti(
        agent.id,
        team.id,
        `${task.title}\n${task.description || ""}\n${JSON.stringify(visibleExecutionContext)}`,
        8
      );
      if (chunks.length > 0) {
        knowledgeContext =
          "\n\n---\nRELEVANT KNOWLEDGE:\n" +
          chunks.map((chunk, index) => `[${index + 1}]${chunk.sourceType === "team" ? " [Team KB]" : ""} ${chunk.content}`).join("\n\n");
      }
    } catch {
      // Ignore RAG failures for team execution.
    }
  }

  let scopedMemoryPrompt = "";
  if (agent.memoryEnabled) {
    const memories = await prisma.agentMemory.findMany({
      where: buildScopedMemoryWhere({
        agentId: agent.id,
        sessionHash: memorySessionHash,
        workflowExecutionId,
        scope: memoryScope,
      }),
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { key: true, value: true },
    }).catch(() => []);
    scopedMemoryPrompt = formatMemoryPrompt(memories);
  }

  const systemPrompt = `${agent.systemPrompt}

${getRoleDirective(member.role)}
You are working inside the team "${team.name}".
Shared team context: ${JSON.stringify(visibleExecutionContext, null, 2)}.
Use this information. After completing your task, include any new information you learned.
Respond with the execution result only.${knowledgeContext}${scopedMemoryPrompt}`;

  // Tools für dieses Team-Mitglied bauen
  const { tools: memberTools, integrations: agentIntegrations } =
    buildMemberTools(member, agent);

  let output = "";
  let tokensIn = 0;
  let tokensOut = 0;

  if (modelProvider === "GOOGLE") {
    if (!userApiKey) {
      throw new Error("Google models require a user API key in Settings.");
    }

    const geminiBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: taskMessage }] }],
      generationConfig: { maxOutputTokens: 2048 },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData?.error?.message || `Google API error: ${response.status}`
      );
    }

    const data = await response.json();
    output = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    tokensIn = data?.usageMetadata?.promptTokenCount || 0;
    tokensOut =
      data?.usageMetadata?.candidatesTokenCount ||
      data?.usageMetadata?.outputTokenCount ||
      0;
  } else if (
    modelProvider === "OPENAI" ||
    modelProvider === "PERPLEXITY" ||
    modelProvider === "GROQ"
  ) {
    let client: OpenAI;

    if (modelProvider === "OPENAI") {
      client = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
    } else if (modelProvider === "PERPLEXITY") {
      if (!userApiKey) {
        throw new Error("Perplexity models require a user API key in Settings.");
      }
      client = new OpenAI({
        apiKey: userApiKey,
        baseURL: "https://api.perplexity.ai",
      });
    } else {
      if (!userApiKey) {
        throw new Error("Groq models require a user API key in Settings.");
      }
      client = new OpenAI({
        apiKey: userApiKey,
        baseURL: "https://api.groq.com/openai/v1",
      });
    }

    const response = await client.chat.completions.create({
      model: selectedModel,
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: taskMessage },
      ],
    });

    output = response.choices[0]?.message?.content || "";
    tokensIn = response.usage?.prompt_tokens || 0;
    tokensOut = response.usage?.completion_tokens || 0;
  } else {
    const client = userApiKey
      ? getClaudeClientWithKey(userApiKey)
      : getClaudeClient();

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: taskMessage },
    ];

    const maxToolRounds = 10;
    let round = 0;

    while (round < maxToolRounds) {
      round++;
      const response = await client.messages.create({
        model: selectedModel,
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        ...(memberTools.length > 0 ? { tools: memberTools } : {}),
      });

      tokensIn += response.usage?.input_tokens || 0;
      tokensOut += response.usage?.output_tokens || 0;

      // Text-Output sammeln
      const textParts = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text);
      if (textParts.length > 0) {
        output += (output ? "\n" : "") + textParts.join("\n");
      }

      // Prüfen ob Tool-Calls vorhanden
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
        break;
      }

      // Tool-Calls ausführen
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks) {
        try {
          const toolInput = toolBlock.input as Record<string, unknown>;

          // Write-Tools direkt ausführen (Team-Kontext hat keine interaktive Approval-UI)
          let result: string;
          if (isWriteTool(toolBlock.name)) {
            result = await executeApprovedWriteTool(
              toolBlock.name,
              toolInput,
              agent.id,
              agentIntegrations
            );
          } else {
            result = await executeChatTool(
              toolBlock.name,
              toolInput,
              agent.id,
              agent.actions || [],
              (agent.customTools || []).map((ct) => ({
                id: ct.id,
                name: ct.name,
                description: ct.description,
                method: ct.method,
                url: ct.url,
                headers: ct.headers,
                bodyTemplate: ct.bodyTemplate,
                responseMapping: ct.responseMapping,
              })),
              {},
              agentIntegrations
            );
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: result,
          });
        } catch (toolErr) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: `Error: ${toolErr instanceof Error ? toolErr.message : "Tool execution failed"}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  if (!output.trim()) {
    throw new Error("The assigned agent returned no output.");
  }

  await deductCredits(agent.userId, selectedModel, "TEAM_TASK", agent.id).catch(
    (error) => {
      console.error("Team task credit deduction failed:", error);
    }
  );

  const structuredOutput = await extractStructuredContextDelta(
    output,
    executionContext
  );

  if (agent.memoryEnabled && Object.keys(structuredOutput).length > 0) {
    await Promise.all(
      Object.entries(structuredOutput)
        .filter(([, value]) => value !== undefined && value !== null)
        .slice(0, 20)
        .map(([key, value]) =>
          prisma.agentMemory.upsert({
            where: {
              agentId_sessionHash_key: {
                agentId: agent.id,
                sessionHash: memorySessionHash,
                key,
              },
            },
            update: {
              value: typeof value === "string" ? value : JSON.stringify(value),
              workflowExecutionId,
              scope: memoryScope,
            },
            create: {
              agentId: agent.id,
              sessionHash: memorySessionHash,
              key,
              value: typeof value === "string" ? value : JSON.stringify(value),
              workflowExecutionId,
              scope: memoryScope,
              orgId: agent.orgId,
            },
          }).catch(() => null)
        )
    );
  }

  if (!tokensIn) {
    tokensIn =
      Math.ceil(taskMessage.length / 4) + Math.ceil(systemPrompt.length / 4);
  }
  if (!tokensOut) {
    tokensOut = Math.ceil(output.length / 4);
  }
  const cost = estimateCost(selectedModel, tokensIn, tokensOut);

  return {
    output: output.trim(),
    structuredOutput,
    model: selectedModel,
    tokensIn,
    tokensOut,
    estimatedCost: cost,
  };
}

async function updateExecutionProgress(
  executionId: string,
  completedTasks: number,
  failedTasks: number,
  executionContext?: TeamSharedContext
) {
  await prisma.teamExecution.update({
    where: { id: executionId },
    data: {
      completedTasks,
      failedTasks,
      ...(executionContext
        ? { executionContext: toJsonValue(executionContext) }
        : {}),
    },
  });
}

async function getFallbackApproverEmail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user?.email || user.email.endsWith("@clerk.temp")) {
    return null;
  }

  return user.email;
}

function buildApprovalRequestUrls(teamId: string, executionId: string, token: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
  const approveUrl = `${appUrl}/api/teams/${teamId}/executions/${executionId}/approve?token=${encodeURIComponent(token)}`;
  const rejectUrl = `${appUrl}/api/teams/${teamId}/executions/${executionId}/approve?token=${encodeURIComponent(token)}&decision=reject`;

  return { approveUrl, rejectUrl };
}

async function pauseForApproval({
  executionId,
  team,
  userId,
  task,
  member,
  inputPayload,
  executionContext,
  previousOutputs,
  logId,
  nextTask,
}: {
  executionId: string;
  team: TeamExecutionRuntimeTeam;
  userId: string;
  task: TeamExecutionTaskInput;
  member: TeamExecutionRuntimeTeam["members"][number];
  inputPayload: Record<string, unknown>;
  executionContext: TeamSharedContext;
  previousOutputs: PriorExecutionOutput[];
  logId: string;
  nextTask: TeamExecutionTaskInput | null;
}) {
  const fallbackEmail = await getFallbackApproverEmail(userId);
  const config = normalizeApprovalGateConfig(member.config, fallbackEmail);

  if (!config.approverEmail) {
    throw new Error(
      "Approval gate requires an approver email before the team can pause for approval."
    );
  }

  const token = crypto.randomBytes(24).toString("hex");
  const approvalRequest = await prisma.approvalRequest.create({
    data: {
      teamExecutionId: executionId,
      gateMemberId: member.id,
      taskIndex: task.taskIndex,
      token,
      approverEmail: config.approverEmail,
    },
  });

  await prisma.$transaction([
    prisma.teamExecutionLog.update({
      where: { id: logId },
      data: {
        status: TeamExecutionTaskStatus.AWAITING_APPROVAL,
        startedAt: new Date(),
        input: toJsonValue({
          ...inputPayload,
          approval: {
            requestId: approvalRequest.id,
            approverEmail: config.approverEmail,
            approvalMessage: config.approvalMessage,
            timeoutHours: config.timeoutHours,
            timeoutAction: config.timeoutAction,
          },
        }),
        error: config.approvalMessage,
      },
    }),
    prisma.agentTeamTask.update({
      where: { id: task.id },
      data: {
        status: "AWAITING_APPROVAL",
        result: config.approvalMessage.slice(0, 5000),
      },
    }),
    prisma.teamExecution.update({
      where: { id: executionId },
      data: {
        status: TeamExecutionStatus.AWAITING_APPROVAL,
        executionContext: toJsonValue(executionContext),
      },
    }),
  ]);

  const previousDecision =
    previousOutputs[previousOutputs.length - 1]?.output ||
    "No previous team output has been recorded yet.";
  const nextStep = nextTask
    ? `${nextTask.title} (${nextTask.priority}) will run next once the approval gate is cleared.`
    : "This approval decides whether the current execution can complete.";
  const urls = buildApprovalRequestUrls(team.id, executionId, token);

  await sendTeamApprovalRequestEmail({
    approverEmail: config.approverEmail,
    teamName: team.name,
    goal: team.goal || null,
    executionId,
    approvalMessage: config.approvalMessage,
    previousDecision,
    nextStep,
    approveUrl: urls.approveUrl,
    rejectUrl: urls.rejectUrl,
    sharedContext: executionContext,
    timeoutHours: config.timeoutHours,
  });

  await emitEvent("team.awaiting_approval", userId, undefined, {
    teamId: team.id,
    executionId,
    taskId: task.id,
    taskIndex: task.taskIndex,
    approverEmail: config.approverEmail,
  });
}

export async function loadTeamExecutionRuntimeContext(teamId: string, userId: string) {
  return prisma.agentTeam.findFirst({
    where: { id: teamId, userId },
    include: teamExecutionRuntimeInclude,
  });
}

interface TeamExecutionAttemptPlan {
  attempt: number;
  strategy: TeamExecutionRuntimeStrategy;
  agent: TeamExecutionRuntimeTeam["members"][number]["agent"];
  modelOverride?: string | null;
  fallbackEvent?: string | null;
}

interface TeamExecutionAttemptResult {
  succeeded: boolean;
  output?: string;
  model?: string;
  contextDelta: TeamSharedContext;
  executionContext: TeamSharedContext;
  error?: string;
  attempt: number;
  strategy: TeamExecutionRuntimeStrategy;
  fallbackEvent?: string | null;
}

function buildExecutionAttemptPlans(
  member: TeamExecutionRuntimeTeam["members"][number]
) {
  const plans: TeamExecutionAttemptPlan[] = [];
  const retryCount = getMemberMaxRetries(member);

  for (let retryIndex = 0; retryIndex <= retryCount; retryIndex += 1) {
    plans.push({
      attempt: retryIndex + 1,
      strategy: "primary",
      agent: member.agent,
      modelOverride: null,
      fallbackEvent: null,
    });
  }

  if (!member.fallbackEnabled) {
    return plans;
  }

  let nextAttempt = plans.length + 1;

  if (member.fallbackAgent) {
    plans.push({
      attempt: nextAttempt,
      strategy: "fallback_agent",
      agent: member.fallbackAgent,
      fallbackEvent: `Primary agent failed after ${retryCount} retries. Falling back to ${describeFallbackTarget({
        agentName: member.fallbackAgent.name,
        model: member.fallbackAgent.llmModel,
      })}.`,
    });
    nextAttempt += 1;
  }

  if (member.fallbackModel && member.agent) {
    plans.push({
      attempt: nextAttempt,
      strategy: "fallback_model",
      agent: member.agent,
      modelOverride: member.fallbackModel,
      fallbackEvent: member.fallbackAgent
        ? `Fallback agent failed. Falling back to ${describeFallbackTarget({
            agentName: member.agent.name,
            model: member.fallbackModel,
          })}.`
        : `Primary agent failed after ${retryCount} retries. Falling back to ${describeFallbackTarget({
            agentName: member.agent.name,
            model: member.fallbackModel,
          })}.`,
    });
  }

  return plans;
}

async function executeTaskWithFallback({
  executionId,
  team,
  member,
  task,
  goal,
  previousOutputs,
  executionContext,
  parallelGroupId,
}: {
  executionId: string;
  team: TeamExecutionRuntimeTeam;
  member: TeamExecutionRuntimeTeam["members"][number];
  task: TeamExecutionTaskInput;
  goal: string;
  previousOutputs: PriorExecutionOutput[];
  executionContext: TeamSharedContext;
  parallelGroupId?: string | null;
}): Promise<TeamExecutionAttemptResult> {
  const plans = buildExecutionAttemptPlans(member);
  let currentExecutionContext = { ...executionContext };
  let lastError = "Task execution failed";

  await prisma.agentTeamTask.update({
    where: { id: task.id },
    data: {
      status: TeamExecutionTaskStatus.RUNNING,
      result: null,
    },
  });

  for (const plan of plans) {
    const baseInputPayload = buildTaskInput(
      team,
      task,
      member,
      previousOutputs,
      currentExecutionContext
    );

    const attemptInput = setTaskRuntimeMeta(baseInputPayload, {
      strategy: plan.strategy,
      fallbackEvent: plan.fallbackEvent || null,
      fallbackAgentId: plan.agent?.id || null,
      fallbackAgentName: plan.agent?.name || null,
      fallbackModel: plan.modelOverride || plan.agent?.llmModel || null,
      maxRetries: getMemberMaxRetries(member),
    });

    const log = await prisma.teamExecutionLog.create({
      data: {
        teamId: team.id,
        executionId,
        taskId: task.id,
        taskIndex: task.taskIndex,
        taskTitle: task.title,
        agentId: plan.agent?.id || null,
        ...(parallelGroupId ? { parallelGroup: parallelGroupId } : {}),
        attempt: plan.attempt,
        status: TeamExecutionTaskStatus.RUNNING,
        startedAt: new Date(),
        input: toJsonValue(attemptInput),
      },
    });

    try {
      const result = await runTeamMemberTask(
        team,
        member,
        task,
        goal,
        previousOutputs,
        currentExecutionContext,
        {
          agentOverride: plan.agent,
          modelOverride: plan.modelOverride,
        }
      );

      const contextDelta = cleanContextDelta(
        result.structuredOutput,
        currentExecutionContext
      );
      currentExecutionContext = mergeExecutionContext(
        currentExecutionContext,
        contextDelta
      );

      await prisma.$transaction([
        prisma.teamExecutionLog.update({
          where: { id: log.id },
          data: {
            status: TeamExecutionTaskStatus.COMPLETED,
            output: result.output,
            structuredOutput: toJsonValue(contextDelta),
            model: result.model,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            estimatedCost: result.estimatedCost,
            completedAt: new Date(),
            input: toJsonValue({
              ...attemptInput,
              sharedContextAfter: getVisibleExecutionContext(currentExecutionContext),
              sharedContextDelta: contextDelta,
            }),
          },
        }),
        prisma.agentTeamTask.update({
          where: { id: task.id },
          data: {
            status: TeamExecutionTaskStatus.COMPLETED,
            result: result.output.slice(0, 5000),
          },
        }),
      ]);

      return {
        succeeded: true,
        output: result.output,
        model: result.model,
        contextDelta,
        executionContext: currentExecutionContext,
        attempt: plan.attempt,
        strategy: plan.strategy,
        fallbackEvent: plan.fallbackEvent || null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Task execution failed";
      lastError = message;

      await prisma.teamExecutionLog.update({
        where: { id: log.id },
        data: {
          status: TeamExecutionTaskStatus.FAILED,
          error: message,
          completedAt: new Date(),
        },
      });
    }
  }

  await prisma.agentTeamTask.update({
    where: { id: task.id },
    data: {
      status: TeamExecutionTaskStatus.FAILED,
      result: lastError.slice(0, 5000),
    },
  });

  return {
    succeeded: false,
    contextDelta: {},
    executionContext: currentExecutionContext,
    error: lastError,
    attempt: plans[plans.length - 1]?.attempt || 1,
    strategy: plans[plans.length - 1]?.strategy || "primary",
    fallbackEvent: plans[plans.length - 1]?.fallbackEvent || null,
  };
}

/* ── Parallel execution helpers ── */

interface ParallelBranchResult {
  memberId: string;
  memberName?: string;
  taskIndex: number;
  taskTitle: string;
  output: string;
  structuredOutput: TeamSharedContext;
  model: string;
  succeeded: boolean;
  error?: string;
}

/**
 * Detect which tasks in the ordered list can run in parallel.
 * Tasks are parallel if they share the same reportsToMemberId AND
 * the reporting member has executionMode === "parallel".
 * Returns groups of consecutive task indices that should be executed together.
 */
function detectParallelGroups(
  orderedTasks: TeamExecutionTaskInput[],
  team: TeamExecutionRuntimeTeam
): Map<number, number[]> {
  // Build map of memberId → executionMode
  const memberModeMap = new Map<string, string>();
  const memberParentMap = new Map<string, string | null>();
  for (const m of team.members) {
    memberModeMap.set(m.id, (m.executionMode as string) || "sequential");
    memberParentMap.set(m.id, m.reportsToMemberId);
  }

  // Group tasks by their assigned member's reportsToMemberId
  const groups = new Map<number, number[]>(); // startIndex → [indices]
  let i = 0;
  while (i < orderedTasks.length) {
    const task = orderedTasks[i];
    const memberId = task.assignedToId;
    if (!memberId) { i++; continue; }

    const parentId = memberParentMap.get(memberId);
    if (!parentId) { i++; continue; }

    // Check if THIS member has executionMode "parallel"
    const memberMode = memberModeMap.get(memberId);
    if (memberMode !== "parallel") { i++; continue; }

    // Find all consecutive tasks at the same level with same parent and parallel mode
    const parallelIndices = [i];
    let j = i + 1;
    while (j < orderedTasks.length) {
      const nextTask = orderedTasks[j];
      const nextMemberId = nextTask.assignedToId;
      if (!nextMemberId) break;
      const nextParent = memberParentMap.get(nextMemberId);
      const nextMode = memberModeMap.get(nextMemberId);
      if (nextParent === parentId && nextMode === "parallel") {
        parallelIndices.push(j);
        j++;
      } else {
        break;
      }
    }

    if (parallelIndices.length > 1) {
      groups.set(i, parallelIndices);
      i = j; // Skip past the parallel group
    } else {
      i++;
    }
  }

  return groups;
}

/**
 * Merge context updates from parallel branches.
 * Last-write-wins for conflicting keys, but we track conflicts.
 */
function mergeParallelContexts(
  baseContext: TeamSharedContext,
  branchDeltas: { memberId: string; delta: TeamSharedContext }[]
): { merged: TeamSharedContext; conflicts: { field: string; writers: string[] }[] } {
  const fieldWriters = new Map<string, string[]>();
  const merged = { ...baseContext };

  for (const { memberId, delta } of branchDeltas) {
    for (const [key, value] of Object.entries(delta)) {
      if (!fieldWriters.has(key)) {
        fieldWriters.set(key, []);
      }
      fieldWriters.get(key)!.push(memberId);
      merged[key] = value;
    }
  }

  const conflicts: { field: string; writers: string[] }[] = [];
  fieldWriters.forEach((writers, field) => {
    if (writers.length > 1) {
      conflicts.push({ field, writers });
    }
  });

  return { merged, conflicts };
}

export async function executeTeamExecution({
  executionId,
  team,
  userId,
  goal,
  tasks,
  priorOutputs = [],
  executionContext: initialExecutionContext = {},
  initialCompletedTasks = 0,
  initialFailedTasks = 0,
}: ExecuteTeamExecutionOptions) {
  const previousOutputs = [...priorOutputs];
  let completedTasks = initialCompletedTasks;
  let failedTasks = initialFailedTasks;
  let executionContext = getExecutionContextMeta(initialExecutionContext).trigger
    ? { ...initialExecutionContext }
    : setExecutionContextMeta(
        { ...initialExecutionContext },
        { trigger: "manual" }
      );
  let pausedForApproval = false;
  const stopOnFailure = shouldStopOnFailure(team);

  try {
    const orderedTasks = [...tasks].sort((a, b) => a.taskIndex - b.taskIndex);
    const parallelGroups = detectParallelGroups(orderedTasks, team);

    // Emit team.execution.started webhook
    await emitEvent("team.execution.started", userId, undefined, {
      teamId: team.id,
      executionId,
      teamName: team.name,
      goal,
      totalTasks: tasks.length,
      taskPlan: orderedTasks.map((t) => ({ taskIndex: t.taskIndex, title: t.title, assignedToId: t.assignedToId })),
    });

    for (let index = 0; index < orderedTasks.length; index += 1) {
      // ── Check if this index starts a parallel group ──
      const parallelIndices = parallelGroups.get(index);
      if (parallelIndices && parallelIndices.length > 1) {
        const parallelGroupId = crypto.randomBytes(8).toString("hex");
        const contextSnapshot = { ...executionContext };
        const branchOutputsCopy = [...previousOutputs];

        // Run all parallel tasks simultaneously
        const branchPromises = parallelIndices.map(async (taskIdx) => {
          const pTask = orderedTasks[taskIdx];
          const pMember = team.members.find((item) => item.id === pTask.assignedToId) || null;

          if (!pMember || !pMember.agent) {
            return { memberId: pMember?.id || "", taskIndex: pTask.taskIndex, taskTitle: pTask.title, output: "", structuredOutput: {}, model: "", succeeded: false, error: "No agent assigned" } satisfies ParallelBranchResult;
          }
          if (pMember.role === "APPROVAL_GATE") {
            return {
              memberId: pMember.id,
              taskIndex: pTask.taskIndex,
              taskTitle: pTask.title,
              output: "",
              structuredOutput: {},
              model: "",
              succeeded: false,
              error: "Approval gates cannot run inside a parallel branch.",
            } satisfies ParallelBranchResult;
          }

          const result = await executeTaskWithFallback({
            executionId,
            team,
            member: pMember,
            task: pTask,
            goal,
            previousOutputs: branchOutputsCopy,
            executionContext: contextSnapshot,
            parallelGroupId,
          });

          if (result.succeeded) {
            await emitEvent("task.completed", userId, pMember.agent?.id, {
              teamId: team.id,
              executionId,
              taskId: pTask.id,
              taskIndex: pTask.taskIndex,
              taskTitle: pTask.title,
              parallelGroup: parallelGroupId,
              sharedContextDelta: result.contextDelta,
              strategy: result.strategy,
              fallbackEvent: result.fallbackEvent || null,
            });

            // Emit step_completed für parallele Branches
            await emitEvent("team.execution.step_completed", userId, pMember.agent?.id, {
              teamId: team.id,
              executionId,
              stepIndex: pTask.taskIndex,
              agentName: pMember.agent?.name || "Unknown",
              agentRole: pMember.role,
              output: result.output || "",
              structuredData: result.contextDelta,
              parallelGroup: parallelGroupId,
              cost: { model: result.model || "", tokensIn: 0, tokensOut: 0, estimatedCost: 0 },
            });

            return {
              memberId: pMember.id,
              memberName: getMemberDisplayName(pMember),
              taskIndex: pTask.taskIndex,
              taskTitle: pTask.title,
              output: result.output || "",
              structuredOutput: result.contextDelta,
              model: result.model || "",
              succeeded: true,
            } satisfies ParallelBranchResult;
          }

          return {
            memberId: pMember.id,
            taskIndex: pTask.taskIndex,
            taskTitle: pTask.title,
            output: "",
            structuredOutput: {},
            model: "",
            succeeded: false,
            error: result.error || "Parallel task failed",
          } satisfies ParallelBranchResult;
        });

        const branchResults = await Promise.all(branchPromises);

        // Merge context from all branches
        const branchDeltas = branchResults
          .filter((r) => r.succeeded)
          .map((r) => ({ memberId: r.memberId, delta: r.structuredOutput }));
        const { merged, conflicts } = mergeParallelContexts(contextSnapshot, branchDeltas);
        executionContext = merged;

        // Store merge conflicts in context for debug visibility
        if (conflicts.length > 0) {
          executionContext._parallelConflicts = conflicts;
        }

        // Update counters and previous outputs
        for (const result of branchResults) {
          if (result.succeeded) {
            completedTasks += 1;
            previousOutputs.push({ taskIndex: result.taskIndex, title: result.taskTitle, output: result.output, memberName: result.memberName });
          } else {
            failedTasks += 1;
            await emitEvent("task.failed", userId, undefined, {
              teamId: team.id,
              executionId,
              taskIndex: result.taskIndex,
              taskTitle: result.taskTitle,
              error: result.error || "Parallel task failed",
              parallelGroup: parallelGroupId,
            });
          }
        }

        await updateExecutionProgress(executionId, completedTasks, failedTasks, executionContext);

        if (stopOnFailure && branchResults.some((result) => !result.succeeded)) {
          break;
        }

        // Skip past all parallel indices
        index = parallelIndices[parallelIndices.length - 1];
        continue;
      }

      // ── Sequential execution (unchanged) ──
      const task = orderedTasks[index];
      const nextTask = orderedTasks[index + 1] || null;
      const member =
        team.members.find((item) => item.id === task.assignedToId) || null;
      const inputPayload = buildTaskInput(
        team,
        task,
        member,
        previousOutputs,
        executionContext
      );

      const firstLog = await prisma.teamExecutionLog.create({
        data: {
          teamId: team.id,
          executionId,
          taskId: task.id,
          taskIndex: task.taskIndex,
          taskTitle: task.title,
          agentId: member?.agent?.id || null,
          attempt: 1,
          status: TeamExecutionTaskStatus.PENDING,
          input: toJsonValue(inputPayload),
        },
      });

      if (!member) {
        const skipMessage = "Task skipped because no team member is assigned.";

        await prisma.$transaction([
          prisma.teamExecutionLog.update({
            where: { id: firstLog.id },
            data: {
              status: TeamExecutionTaskStatus.SKIPPED,
              startedAt: new Date(),
              completedAt: new Date(),
              error: skipMessage,
            },
          }),
          prisma.agentTeamTask.update({
            where: { id: task.id },
            data: {
              status: TeamExecutionTaskStatus.SKIPPED,
              result: skipMessage,
            },
          }),
        ]);

        continue;
      }

      if (member.role === "APPROVAL_GATE") {
        await pauseForApproval({
          executionId,
          team,
          userId,
          task,
          member,
          inputPayload,
          executionContext,
          previousOutputs,
          logId: firstLog.id,
          nextTask,
        });

        // Emit team.execution.approval_needed webhook
        await emitEvent("team.execution.approval_needed", userId, undefined, {
          teamId: team.id,
          executionId,
          stepIndex: task.taskIndex,
          gateName: member.agent?.name || "Approval Gate",
          taskTitle: task.title,
          completedSteps: completedTasks,
          totalSteps: tasks.length,
          sharedMemory: getVisibleExecutionContext(executionContext),
        });

        pausedForApproval = true;
        break;
      }

      await prisma.teamExecutionLog.delete({
        where: { id: firstLog.id },
      });

      const result = await executeTaskWithFallback({
        executionId,
        team,
        member,
        task,
        goal,
        previousOutputs,
        executionContext,
      });

      if (!result.succeeded) {
        failedTasks += 1;
        await updateExecutionProgress(
          executionId,
          completedTasks,
          failedTasks,
          result.executionContext
        );
        await emitEvent("task.failed", userId, member.agent?.id, {
          teamId: team.id,
          executionId,
          taskId: task.id,
          taskIndex: task.taskIndex,
          taskTitle: task.title,
          error: result.error || "Task execution failed",
          strategy: result.strategy,
          fallbackEvent: result.fallbackEvent || null,
        });
        executionContext = result.executionContext;
        if (stopOnFailure) {
          break;
        }
        continue;
      }

      executionContext = result.executionContext;
      completedTasks += 1;
      previousOutputs.push({
        taskIndex: task.taskIndex,
        title: task.title,
        output: result.output || "",
        memberName: getMemberDisplayName(member),
      });

      await updateExecutionProgress(
        executionId,
        completedTasks,
        failedTasks,
        executionContext
      );
      await emitEvent("task.completed", userId, member.agent?.id, {
        teamId: team.id,
        executionId,
        taskId: task.id,
        taskIndex: task.taskIndex,
        taskTitle: task.title,
        attempt: result.attempt,
        sharedContextDelta: result.contextDelta,
        strategy: result.strategy,
        fallbackEvent: result.fallbackEvent || null,
      });

      // Emit team.execution.step_completed webhook mit vollem Payload
      const nextMember = nextTask ? team.members.find((m) => m.id === nextTask.assignedToId) : null;
      await emitEvent("team.execution.step_completed", userId, member.agent?.id, {
        teamId: team.id,
        executionId,
        stepIndex: task.taskIndex,
        agentName: member.agent?.name || "Unknown",
        agentRole: member.role,
        input: buildTaskInput(team, task, member, previousOutputs.slice(0, -1), executionContext),
        output: result.output || "",
        structuredData: result.contextDelta,
        sharedMemory: getVisibleExecutionContext(executionContext),
        routingDecision: result.strategy,
        cost: {
          model: result.model || "",
          tokensIn: 0,
          tokensOut: 0,
          estimatedCost: 0,
        },
        nextAgent: nextMember
          ? { name: nextMember.agent?.name || "Unknown", role: nextMember.role, taskTitle: nextTask?.title || "" }
          : null,
      });

      // ── Feedback Loop: check if this member has a loop config ──
      const feedbackLoop = parseFeedbackLoop(member.feedbackLoop);
      if (feedbackLoop) {
        const loopKey = `_loop_${member.id}`;
        const iterationCount = (typeof executionContext[loopKey] === "number" ? executionContext[loopKey] as number : 0);
        const lastOutput = previousOutputs[previousOutputs.length - 1];

        // Evaluate quality from the structured output (which is now in executionContext)
        const quality = evaluateQuality(executionContext, feedbackLoop.qualityField, feedbackLoop.qualityThreshold);

        if (!quality.passed && iterationCount < feedbackLoop.maxIterations) {
          // Route back to target member with feedback
          const targetMember = team.members.find((m) => m.id === feedbackLoop.targetMemberId);
          if (targetMember && targetMember.agent) {
            const newIteration = iterationCount + 1;
            executionContext = mergeExecutionContext(executionContext, { [loopKey]: newIteration });

            // Build feedback task
            const feedbackTaskId = `${task.id}_loop_${newIteration}`;
            const feedbackTask: TeamExecutionTaskInput = {
              id: feedbackTaskId,
              title: `${task.title} — Revision ${newIteration}/${feedbackLoop.maxIterations}`,
              description: `Your previous output was reviewed. The quality score for "${feedbackLoop.qualityField}" was ${quality.score ?? "N/A"}, which is below the threshold of ${feedbackLoop.qualityThreshold}. Please revise your work based on the following feedback:\n\n${lastOutput?.output?.slice(0, 3000) || "No feedback provided."}\n\nIteration ${newIteration} of ${feedbackLoop.maxIterations}.`,
              priority: task.priority,
              assignedToId: targetMember.id,
              taskIndex: task.taskIndex + 0.1 * newIteration,
            };

            // Create log for loop iteration
            const loopLogId = (await prisma.teamExecutionLog.create({
              data: {
                teamId: team.id,
                executionId,
                taskId: task.id,
                taskIndex: task.taskIndex,
                taskTitle: feedbackTask.title,
                agentId: targetMember.agent.id,
                attempt: 1,
                status: TeamExecutionTaskStatus.RUNNING,
                startedAt: new Date(),
                input: toJsonValue({
                  feedbackLoop: true,
                  iteration: newIteration,
                  maxIterations: feedbackLoop.maxIterations,
                  qualityField: feedbackLoop.qualityField,
                  qualityScore: quality.score,
                  qualityThreshold: feedbackLoop.qualityThreshold,
                }),
              },
            })).id;

            try {
              const loopResult = await runTeamMemberTask(
                team,
                targetMember,
                feedbackTask,
                goal,
                previousOutputs,
                executionContext
              );

              const loopDelta = cleanContextDelta(loopResult.structuredOutput, executionContext);
              executionContext = mergeExecutionContext(executionContext, loopDelta);

              await prisma.teamExecutionLog.update({
                where: { id: loopLogId },
                data: {
                  status: TeamExecutionTaskStatus.COMPLETED,
                  output: loopResult.output,
                  structuredOutput: toJsonValue(loopDelta),
                  model: loopResult.model,
                  completedAt: new Date(),
                },
              });

              // Replace the previous output with revised version
              previousOutputs[previousOutputs.length - 1] = {
                taskIndex: task.taskIndex,
                title: feedbackTask.title,
                output: loopResult.output,
              };

              await updateExecutionProgress(executionId, completedTasks, failedTasks, executionContext);

              // Re-run current evaluator task (the one that checks quality)
              // by decrementing the loop index so the for-loop re-processes this task
              index -= 1;
              continue;
            } catch (loopError) {
              const loopMsg = loopError instanceof Error ? loopError.message : "Loop iteration failed";
              await prisma.teamExecutionLog.update({
                where: { id: loopLogId },
                data: {
                  status: TeamExecutionTaskStatus.FAILED,
                  error: loopMsg,
                  completedAt: new Date(),
                },
              });
              // Continue to next task on loop failure
            }
          }
        }
      }

      // ── TRIGGER_TEAM: check if this member has team trigger actions ──
      if (member.enabledActions?.includes("TRIGGER_TEAM")) {
        const memberConfig = member.config as Record<string, unknown> | null;
        const triggerConfig = memberConfig?.triggerTeam;
        if (triggerConfig && typeof triggerConfig === "object") {
          try {
            const { parseTriggerTeamConfig, triggerTeamExecution } = await import("@/lib/team-communication");
            const tc = parseTriggerTeamConfig(triggerConfig);
            if (tc) {
              const triggerResult = await triggerTeamExecution({
                userId,
                targetTeamId: tc.targetTeamId,
                sourceExecutionId: executionId,
                sourceTeamId: team.id,
                sharedContext: executionContext,
                config: tc,
              });

              // Ergebnis in Context speichern
              executionContext = mergeExecutionContext(executionContext, {
                [`_triggered_${tc.targetTeamId}`]: {
                  executionId: triggerResult.executionId,
                  status: triggerResult.status,
                  ...(triggerResult.result ? { result: triggerResult.result } : {}),
                },
              });

              await updateExecutionProgress(executionId, completedTasks, failedTasks, executionContext);
            }
          } catch (triggerError) {
            console.error("TRIGGER_TEAM failed:", triggerError);
            // Nicht den gesamten Lauf abbrechen
          }
        }
      }
    }

    if (pausedForApproval) {
      return;
    }

    const finalStatus =
      failedTasks > 0
        ? completedTasks > 0
          ? TeamExecutionStatus.PARTIAL
          : TeamExecutionStatus.FAILED
        : TeamExecutionStatus.COMPLETED;

    await prisma.teamExecution.update({
      where: { id: executionId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        completedTasks,
        failedTasks,
        executionContext: toJsonValue(executionContext),
      },
    });

    await emitEvent("team.completed", userId, undefined, {
      teamId: team.id,
      executionId,
      teamName: team.name,
      goal,
      totalTasks: tasks.length,
      completedTasks,
      failedTasks,
      status: finalStatus,
      executionContext,
    });

    // Emit granulare team.execution.completed / team.execution.failed webhooks
    const teamExecEventType = finalStatus === TeamExecutionStatus.FAILED
      ? "team.execution.failed" as const
      : "team.execution.completed" as const;
    await emitEvent(teamExecEventType, userId, undefined, {
      teamId: team.id,
      executionId,
      teamName: team.name,
      goal,
      totalTasks: tasks.length,
      completedTasks,
      failedTasks,
      status: finalStatus,
      sharedMemory: getVisibleExecutionContext(executionContext),
    });

    // Process queue: start next queued execution if capacity available
    try {
      const { processQueue } = await import("@/lib/execution-queue");
      await processQueue(team.id);
    } catch { /* Queue processing is best-effort */ }
  } catch (error) {
    console.error("Team execution runtime failed:", error);
    const finalStatus =
      completedTasks > 0 ? TeamExecutionStatus.PARTIAL : TeamExecutionStatus.FAILED;

    await prisma.teamExecution
      .update({
        where: { id: executionId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          completedTasks,
          failedTasks: failedTasks > 0 ? failedTasks : 1,
          executionContext: toJsonValue(executionContext),
        },
      })
      .catch((updateError) => {
        console.error("Failed to mark team execution as failed:", updateError);
      });

    // Emit team.execution.failed webhook
    await emitEvent("team.execution.failed", userId, undefined, {
      teamId: team.id,
      executionId,
      teamName: team.name,
      goal,
      error: error instanceof Error ? error.message : "Unknown error",
      completedTasks,
      failedTasks: failedTasks > 0 ? failedTasks : 1,
      status: finalStatus,
    }).catch(() => {});

    // Process queue even on failure
    try {
      const { processQueue } = await import("@/lib/execution-queue");
      await processQueue(team.id);
    } catch { /* Queue processing is best-effort */ }
  }
}

export async function loadApprovalExecutionByToken(
  teamId: string,
  executionId: string,
  token: string
) {
  const execution = await prisma.teamExecution.findFirst({
    where: {
      id: executionId,
      teamId,
      approvalRequests: {
        some: { token },
      },
    },
    include: {
      team: {
        include: teamExecutionRuntimeInclude,
      },
      logs: {
        include: {
          agent: { select: { id: true, name: true } },
        },
        orderBy: [{ taskIndex: "asc" }, { attempt: "asc" }],
      },
      approvalRequests: {
        where: { token },
        include: {
          gateMember: {
            include: {
              agent: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  });

  if (!execution) {
    return null;
  }

  const approvalRequest = execution.approvalRequests[0] || null;
  if (!approvalRequest) {
    return null;
  }

  return {
    execution,
    team: execution.team,
    approvalRequest,
  };
}

export async function resolveApprovalTimeoutIfNeeded(
  teamId: string,
  executionId: string,
  token: string
) {
  const loaded = await loadApprovalExecutionByToken(teamId, executionId, token);
  if (!loaded) {
    return null;
  }

  const { execution, approvalRequest } = loaded;
  if (
    execution.status !== TeamExecutionStatus.AWAITING_APPROVAL ||
    approvalRequest.status !== ApprovalRequestStatus.PENDING
  ) {
    return loaded;
  }

  const config = normalizeApprovalGateConfig(
    approvalRequest.gateMember?.config,
    approvalRequest.approverEmail
  );

  if (!approvalRequest.requestedAt || !config.timeoutHours) {
    return loaded;
  }

  const deadline = new Date(
    approvalRequest.requestedAt.getTime() + config.timeoutHours * 60 * 60 * 1000
  );
  if (Date.now() < deadline.getTime()) {
    return loaded;
  }

  const latestLog = execution.logs
    .filter((log) => log.taskIndex === approvalRequest.taskIndex)
    .sort((a, b) => b.attempt - a.attempt)[0];

  const resolutionNote =
    config.timeoutAction === "auto_reject"
      ? "Approval timed out and was rejected automatically."
      : config.timeoutAction === "auto_approve"
        ? "Approval timed out and was approved automatically."
        : "Approval timed out and the gate was skipped automatically.";

  if (config.timeoutAction === "auto_reject") {
    await prisma.$transaction([
      prisma.approvalRequest.update({
        where: { id: approvalRequest.id },
        data: {
          status: ApprovalRequestStatus.REJECTED,
          respondedAt: new Date(),
          respondedBy: "timeout",
          note: resolutionNote,
        },
      }),
      prisma.teamExecution.update({
        where: { id: execution.id },
        data: {
          status: TeamExecutionStatus.REJECTED,
          completedAt: new Date(),
        },
      }),
      ...(latestLog
        ? [
            prisma.teamExecutionLog.update({
              where: { id: latestLog.id },
              data: {
                status: TeamExecutionTaskStatus.REJECTED,
                error: resolutionNote,
                completedAt: new Date(),
              },
            }),
          ]
        : []),
    ]);

    return loadApprovalExecutionByToken(teamId, executionId, token);
  }

  await prisma.$transaction([
    prisma.approvalRequest.update({
      where: { id: approvalRequest.id },
      data: {
        status:
          config.timeoutAction === "auto_approve"
            ? ApprovalRequestStatus.APPROVED
            : ApprovalRequestStatus.SKIPPED,
        respondedAt: new Date(),
        respondedBy: "timeout",
        note: resolutionNote,
      },
    }),
    prisma.teamExecution.update({
      where: { id: execution.id },
      data: {
        status: TeamExecutionStatus.RUNNING,
      },
    }),
    ...(latestLog
      ? [
          prisma.teamExecutionLog.update({
            where: { id: latestLog.id },
            data: {
              status:
                config.timeoutAction === "auto_approve"
                  ? TeamExecutionTaskStatus.COMPLETED
                  : TeamExecutionTaskStatus.SKIPPED,
              output: resolutionNote,
              completedAt: new Date(),
            },
          }),
          ...(latestLog.taskId
            ? [
                prisma.agentTeamTask.update({
                  where: { id: latestLog.taskId },
                  data: {
                    status:
                      config.timeoutAction === "auto_approve"
                        ? "COMPLETED"
                        : "SKIPPED",
                    result: resolutionNote.slice(0, 5000),
                  },
                }),
              ]
            : []),
        ]
      : []),
  ]);

  return loadApprovalExecutionByToken(teamId, executionId, token);
}
