import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  Prisma,
  TeamExecutionStatus,
  TeamExecutionTaskStatus,
  type AgentTeamRole,
} from "@prisma/client";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { deductCredits } from "@/lib/credits";
import { decrypt } from "@/lib/encryption";
import { emitEvent } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";

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

interface ExecuteTeamExecutionOptions {
  executionId: string;
  team: TeamExecutionRuntimeTeam;
  userId: string;
  goal: string;
  tasks: TeamExecutionTaskInput[];
  priorOutputs?: PriorExecutionOutput[];
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function buildTaskInput(
  team: TeamExecutionRuntimeTeam,
  task: TeamExecutionTaskInput,
  member: TeamExecutionRuntimeTeam["members"][number] | null,
  previousOutputs: PriorExecutionOutput[]
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
          agentId: member.agent.id,
          agentName: member.agent.name,
          agentMode: member.agent.agentMode,
        }
      : null,
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
  previousOutputs: PriorExecutionOutput[]
) {
  const previousOutputText = previousOutputs.length > 0
    ? previousOutputs
        .sort((a, b) => a.taskIndex - b.taskIndex)
        .map(
          (output) =>
            `Task ${output.taskIndex + 1}: ${output.title}\n${output.output.slice(0, 2000)}`
        )
        .join("\n\n---\n\n")
    : "No previous task outputs yet.";

  return `You are executing a sub-task as part of the team workflow.

Overall team goal:
${goal}

Your assigned role:
${member.role}${member.responsibilities ? ` — ${member.responsibilities}` : ""}

Current sub-task:
Title: ${task.title}
Priority: ${task.priority}
Description: ${task.description || "No extra description provided."}

Outputs from previously completed tasks:
${previousOutputText}

Instructions:
- Complete only the current sub-task.
- Use previous outputs when helpful, but do not repeat them verbatim.
- Return a practical result another team member can build on.
- Be concrete and concise.
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
    case "EXECUTOR":
    default:
      return "You are the execution specialist. Deliver the assigned work directly and efficiently.";
  }
}

async function runTeamMemberTask(
  team: TeamExecutionRuntimeTeam,
  member: TeamExecutionRuntimeTeam["members"][number],
  task: TeamExecutionTaskInput,
  goal: string,
  previousOutputs: PriorExecutionOutput[]
) {
  const agent = member.agent;
  const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";
  const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || agent.modelProvider || "ANTHROPIC";

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

  const taskMessage = buildTaskMessage(goal, task, member, previousOutputs);

  let knowledgeContext = "";
  if (agent.knowledgeBases.length > 0) {
    try {
      const chunks = await searchRelevantChunks(agent.id, `${task.title}\n${task.description || ""}`, 5);
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
      throw new Error(errorData?.error?.message || `Google API error: ${response.status}`);
    }

    const data = await response.json();
    output = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else if (modelProvider === "OPENAI" || modelProvider === "PERPLEXITY" || modelProvider === "GROQ") {
    let client: OpenAI;

    if (modelProvider === "OPENAI") {
      client = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
    } else if (modelProvider === "PERPLEXITY") {
      if (!userApiKey) {
        throw new Error("Perplexity models require a user API key in Settings.");
      }
      client = new OpenAI({ apiKey: userApiKey, baseURL: "https://api.perplexity.ai" });
    } else {
      if (!userApiKey) {
        throw new Error("Groq models require a user API key in Settings.");
      }
      client = new OpenAI({ apiKey: userApiKey, baseURL: "https://api.groq.com/openai/v1" });
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
    const client = userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient();
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

  await deductCredits(agent.userId, selectedModel, "TEAM_TASK", agent.id).catch((error) => {
    console.error("Team task credit deduction failed:", error);
  });

  return output.trim();
}

async function updateExecutionProgress(
  executionId: string,
  completedTasks: number,
  failedTasks: number
) {
  await prisma.teamExecution.update({
    where: { id: executionId },
    data: { completedTasks, failedTasks },
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
}: ExecuteTeamExecutionOptions) {
  const previousOutputs = [...priorOutputs];
  let completedTasks = 0;
  let failedTasks = 0;

  try {
    for (const task of tasks.sort((a, b) => a.taskIndex - b.taskIndex)) {
      const member = team.members.find((item) => item.id === task.assignedToId) || null;
      const inputPayload = buildTaskInput(team, task, member, previousOutputs);

      const firstLog = await prisma.teamExecutionLog.create({
        data: {
          teamId: team.id,
          executionId,
          taskId: task.id,
          taskIndex: task.taskIndex,
          taskTitle: task.title,
          agentId: member?.agent.id || null,
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

      await prisma.agentTeamTask.update({
        where: { id: task.id },
        data: {
          status: TeamExecutionTaskStatus.RUNNING,
          result: null,
        },
      });

      let succeeded = false;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const logId = attempt === 1
          ? firstLog.id
          : (await prisma.teamExecutionLog.create({
              data: {
                teamId: team.id,
                executionId,
                taskId: task.id,
                taskIndex: task.taskIndex,
                taskTitle: task.title,
                agentId: member.agent.id,
                attempt,
                status: TeamExecutionTaskStatus.PENDING,
                input: toJsonValue(inputPayload),
              },
            })).id;

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
          const output = await runTeamMemberTask(team, member, task, goal, previousOutputs);
          const completedAt = new Date();

          await prisma.$transaction([
            prisma.teamExecutionLog.update({
              where: { id: logId },
              data: {
                status: TeamExecutionTaskStatus.COMPLETED,
                output,
                completedAt,
              },
            }),
            prisma.agentTeamTask.update({
              where: { id: task.id },
              data: {
                status: TeamExecutionTaskStatus.COMPLETED,
                result: output.slice(0, 5000),
              },
            }),
          ]);

          completedTasks += 1;
          previousOutputs.push({
            taskIndex: task.taskIndex,
            title: task.title,
            output,
          });

          await updateExecutionProgress(executionId, completedTasks, failedTasks);
          await emitEvent("task.completed", userId, member.agent.id, {
            teamId: team.id,
            executionId,
            taskId: task.id,
            taskIndex: task.taskIndex,
            taskTitle: task.title,
            attempt,
          });

          succeeded = true;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Task execution failed";

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

            await updateExecutionProgress(executionId, completedTasks, failedTasks);
            await emitEvent("task.failed", userId, member.agent.id, {
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

    const finalStatus = failedTasks > 0
      ? (completedTasks > 0 ? TeamExecutionStatus.PARTIAL : TeamExecutionStatus.FAILED)
      : TeamExecutionStatus.COMPLETED;

    await prisma.teamExecution.update({
      where: { id: executionId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        completedTasks,
        failedTasks,
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
    });
  } catch (error) {
    console.error("Team execution runtime failed:", error);
    const finalStatus = completedTasks > 0 ? TeamExecutionStatus.PARTIAL : TeamExecutionStatus.FAILED;

    await prisma.teamExecution.update({
      where: { id: executionId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        completedTasks,
        failedTasks: failedTasks > 0 ? failedTasks : 1,
      },
    }).catch((updateError) => {
      console.error("Failed to mark team execution as failed:", updateError);
    });
  }
}
