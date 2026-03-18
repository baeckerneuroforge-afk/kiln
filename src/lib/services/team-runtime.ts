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
  MODEL_PROVIDER_MAP,
} from "@/lib/ai";
import { deductCredits } from "@/lib/credits";
import { decrypt } from "@/lib/encryption";
import { sendTeamApprovalRequestEmail } from "@/lib/email-notifications";
import { emitEvent } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import {
  normalizeApprovalGateConfig,
  type ApprovalGateConfig,
} from "@/lib/team-approval";

const teamExecutionRuntimeInclude = {
  members: {
    include: {
      agent: {
        include: {
          knowledgeBases: { where: { embeddingStatus: "READY" } },
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
}

interface TeamTaskResult {
  output: string;
  structuredOutput: TeamSharedContext;
  model: string;
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

function cleanContextDelta(
  input: unknown,
  currentContext: TeamSharedContext
): TeamSharedContext {
  const record = toPlainObject(input);
  const next: TeamSharedContext = {};

  for (const [key, value] of Object.entries(record)) {
    if (!key.trim()) continue;
    if (value === undefined) continue;
    if (JSON.stringify(currentContext[key]) === JSON.stringify(value)) continue;
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

function getMemberDisplayName(
  member: TeamExecutionRuntimeTeam["members"][number] | null
) {
  if (!member) return "Unassigned";
  if (member.role === "APPROVAL_GATE") return "Approval Gate";
  return member.agent?.name || "Unnamed agent";
}

function buildTaskInput(
  team: TeamExecutionRuntimeTeam,
  task: TeamExecutionTaskInput,
  member: TeamExecutionRuntimeTeam["members"][number] | null,
  previousOutputs: PriorExecutionOutput[],
  executionContext: TeamSharedContext
) {
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
          agentMode: member.agent?.agentMode || null,
        }
      : null,
    sharedContext: executionContext,
    previousOutputs: previousOutputs.map((item) => ({
      taskIndex: item.taskIndex,
      title: item.title,
      output: item.output,
    })),
  };
}

function buildTaskMessage(
  goal: string,
  task: TeamExecutionTaskInput,
  member: TeamExecutionRuntimeTeam["members"][number],
  previousOutputs: PriorExecutionOutput[],
  executionContext: TeamSharedContext
) {
  const previousOutputText =
    previousOutputs.length > 0
      ? previousOutputs
          .sort((a, b) => a.taskIndex - b.taskIndex)
          .map(
            (output) =>
              `Task ${output.taskIndex + 1}: ${output.title}\n${output.output.slice(0, 2000)}`
          )
          .join("\n\n---\n\n")
      : "No previous task outputs yet.";

  const sharedContextText =
    Object.keys(executionContext).length > 0
      ? JSON.stringify(executionContext, null, 2)
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
- Use the shared team context and previous outputs when helpful.
- Return a practical result another team member can build on.
- Be concrete and concise.
- After completing the task, include any new factual information you learned so it can be shared with the team.
- If the task cannot be completed, clearly explain what is blocking it.`;
}

function getRoleDirective(role: AgentTeamRole) {
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
  const trimmed = output.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return cleanContextDelta(parsed, currentContext);
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
${JSON.stringify(currentContext, null, 2)}`,
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
      currentContext
    );
  } catch {
    return {};
  }
}

async function runTeamMemberTask(
  team: TeamExecutionRuntimeTeam,
  member: TeamExecutionRuntimeTeam["members"][number],
  task: TeamExecutionTaskInput,
  goal: string,
  previousOutputs: PriorExecutionOutput[],
  executionContext: TeamSharedContext
): Promise<TeamTaskResult> {
  const agent = member.agent;
  if (!agent) {
    throw new Error("This team member is not linked to an AI agent.");
  }

  const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";
  const modelProvider =
    MODEL_PROVIDER_MAP[selectedModel] || agent.modelProvider || "ANTHROPIC";

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

  let knowledgeContext = "";
  if (agent.knowledgeBases.length > 0) {
    try {
      const chunks = await searchRelevantChunks(
        agent.id,
        `${task.title}\n${task.description || ""}\n${JSON.stringify(executionContext)}`,
        5
      );
      if (chunks.length > 0) {
        knowledgeContext =
          "\n\n---\nRELEVANT KNOWLEDGE:\n" +
          chunks.map((chunk, index) => `[${index + 1}] ${chunk.content}`).join("\n\n");
      }
    } catch {
      // Ignore RAG failures for team execution.
    }
  }

  const systemPrompt = `${agent.systemPrompt}

${getRoleDirective(member.role)}
You are working inside the team "${team.name}".
Shared team context: ${JSON.stringify(executionContext, null, 2)}.
Use this information. After completing your task, include any new information you learned.
Respond with the execution result only.${knowledgeContext}`;

  let output = "";

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
  } else {
    const client = userApiKey
      ? getClaudeClientWithKey(userApiKey)
      : getClaudeClient();
    const response = await client.messages.create({
      model: selectedModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: taskMessage }],
    });

    output = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
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

  return {
    output: output.trim(),
    structuredOutput,
    model: selectedModel,
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
  let executionContext = { ...initialExecutionContext };
  let pausedForApproval = false;

  try {
    const orderedTasks = [...tasks].sort((a, b) => a.taskIndex - b.taskIndex);

    for (let index = 0; index < orderedTasks.length; index += 1) {
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
        pausedForApproval = true;
        break;
      }

      await prisma.agentTeamTask.update({
        where: { id: task.id },
        data: {
          status: TeamExecutionTaskStatus.RUNNING,
          result: null,
        },
      });

      let succeeded = false;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const logId =
          attempt === 1
            ? firstLog.id
            : (
                await prisma.teamExecutionLog.create({
                  data: {
                    teamId: team.id,
                    executionId,
                    taskId: task.id,
                    taskIndex: task.taskIndex,
                    taskTitle: task.title,
                    agentId: member.agent?.id || null,
                    attempt,
                    status: TeamExecutionTaskStatus.PENDING,
                    input: toJsonValue(inputPayload),
                  },
                })
              ).id;

        const startedAt = new Date();

        await prisma.teamExecutionLog.update({
          where: { id: logId },
          data: {
            status: TeamExecutionTaskStatus.RUNNING,
            startedAt,
            error: null,
          },
        });

        try {
          const result = await runTeamMemberTask(
            team,
            member,
            task,
            goal,
            previousOutputs,
            executionContext
          );
          const completedAt = new Date();
          const contextDelta = cleanContextDelta(
            result.structuredOutput,
            executionContext
          );
          executionContext = mergeExecutionContext(executionContext, contextDelta);

          await prisma.$transaction([
            prisma.teamExecutionLog.update({
              where: { id: logId },
              data: {
                status: TeamExecutionTaskStatus.COMPLETED,
                output: result.output,
                structuredOutput: toJsonValue(contextDelta),
                model: result.model,
                completedAt,
                input: toJsonValue({
                  ...inputPayload,
                  sharedContextAfter: executionContext,
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

          completedTasks += 1;
          previousOutputs.push({
            taskIndex: task.taskIndex,
            title: task.title,
            output: result.output,
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
            attempt,
            sharedContextDelta: contextDelta,
          });

          succeeded = true;
          break;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Task execution failed";

          await prisma.teamExecutionLog.update({
            where: { id: logId },
            data: {
              status: TeamExecutionTaskStatus.FAILED,
              error: message,
              completedAt: new Date(),
            },
          });

          if (attempt === 2) {
            failedTasks += 1;
            await prisma.agentTeamTask.update({
              where: { id: task.id },
              data: {
                status: TeamExecutionTaskStatus.FAILED,
                result: message.slice(0, 5000),
              },
            });

            await updateExecutionProgress(
              executionId,
              completedTasks,
              failedTasks,
              executionContext
            );
            await emitEvent("task.failed", userId, member.agent?.id, {
              teamId: team.id,
              executionId,
              taskId: task.id,
              taskIndex: task.taskIndex,
              taskTitle: task.title,
              error: message,
            });
          }
        }
      }

      if (!succeeded) {
        continue;
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

  const { execution, team, approvalRequest } = loaded;
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
