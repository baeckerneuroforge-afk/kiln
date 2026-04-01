import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import type { AgentTeamRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { estimateCost } from "@/lib/model-pricing";
import {
  getExecutionContextMeta,
  getTaskRuntimeMeta,
  stripExecutionContextMeta,
} from "@/lib/team-execution-metadata";
import { resolveTimedOutApprovalIfNeeded } from "@/lib/services/team-approval-runtime";
import {
  buildTaskMessage,
  getMemberDisplayName,
  getRoleDirective,
  type TeamExecutionTaskInput,
} from "@/lib/services/team-runtime";
import type {
  ReplayApprovalRequest,
  ReplayConnection,
  ReplayMember,
  ReplayPreviousOutput,
  ReplayRoutingData,
  ReplayStep,
  TeamExecutionReplayResponse,
} from "@/lib/team-execution-replay-types";

function toPlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function toSavedPositions(
  value: unknown
): Record<string, { x: number; y: number }> {
  const positions = toPlainObject(value);
  const next: Record<string, { x: number; y: number }> = {};

  for (const [key, entry] of Object.entries(positions)) {
    if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).x === "number" &&
      typeof (entry as Record<string, unknown>).y === "number"
    ) {
      next[key] = {
        x: (entry as Record<string, number>).x,
        y: (entry as Record<string, number>).y,
      };
    }
  }

  return next;
}

function parsePreviousOutputs(value: unknown): ReplayPreviousOutput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (
        typeof record.taskIndex !== "number" ||
        typeof record.title !== "string" ||
        typeof record.output !== "string"
      ) {
        return null;
      }

      return {
        taskIndex: record.taskIndex,
        title: record.title,
        output: record.output,
      };
    })
    .filter((item): item is ReplayPreviousOutput => Boolean(item));
}

function toTaskInput(
  log: {
    taskId: string | null;
    taskIndex: number;
    taskTitle: string;
    task: {
      id: string;
      title: string;
      description: string | null;
      priority: string;
      assignedToId: string | null;
    } | null;
  },
  inputRecord: Record<string, unknown>
): TeamExecutionTaskInput {
  const inputTask =
    inputRecord.task &&
    typeof inputRecord.task === "object" &&
    !Array.isArray(inputRecord.task)
      ? (inputRecord.task as Record<string, unknown>)
      : null;

  return {
    id:
      log.task?.id ||
      log.taskId ||
      (typeof inputTask?.id === "string" ? inputTask.id : `task-${log.taskIndex}`),
    title:
      log.task?.title ||
      log.taskTitle ||
      (typeof inputTask?.title === "string" ? inputTask.title : `Task ${log.taskIndex + 1}`),
    description:
      log.task?.description ??
      (typeof inputTask?.description === "string" ? inputTask.description : null),
    priority:
      log.task?.priority ||
      (typeof inputTask?.priority === "string" ? inputTask.priority : "MEDIUM"),
    assignedToId:
      log.task?.assignedToId ||
      (typeof inputTask?.assignedToId === "string" ? inputTask.assignedToId : null),
    taskIndex:
      typeof inputTask?.index === "number" ? inputTask.index : log.taskIndex,
  };
}

function getReplayMemberName(
  member:
    | {
        role: AgentTeamRole;
        agent?: { name: string | null } | null;
        config?: unknown;
      }
    | null
    | undefined
) {
  if (!member) return "Unassigned";
  if (member.agent?.name) return member.agent.name;

  const config =
    member.config && typeof member.config === "object" && !Array.isArray(member.config)
      ? (member.config as Record<string, unknown>)
      : null;

  return typeof config?.label === "string" && config.label.trim()
    ? config.label.trim()
    : member.role === "APPROVAL_GATE"
      ? "Approval Gate"
      : "Unassigned member";
}

function buildPromptData(params: {
  baseSystemPrompt: string;
  role: AgentTeamRole;
  teamName: string;
  taskMessage: string;
  sharedContext: Record<string, unknown>;
  knowledgeContext: string[];
}) {
  const knowledgeText =
    params.knowledgeContext.length > 0
      ? "\n\n---\nRELEVANT KNOWLEDGE:\n" +
        params.knowledgeContext
          .map((chunk, index) => `[${index + 1}] ${chunk}`)
          .join("\n\n")
      : "";

  const system = `${params.baseSystemPrompt}

${getRoleDirective(params.role)}
You are working inside the team "${params.teamName}".
Shared team context: ${JSON.stringify(params.sharedContext, null, 2)}.
Use this information. After completing your task, include any new information you learned.
Respond with the execution result only.${knowledgeText}`;

  return {
    system,
    user: params.taskMessage,
    fullPrompt: `SYSTEM:\n${system}\n\nUSER:\n${params.taskMessage}`,
    knowledgeContext: params.knowledgeContext,
  };
}

function buildComparisonText(
  condition: string | null,
  nextMemberName: string | null,
  sharedContextAfter: Record<string, unknown>,
  structuredOutput: Record<string, unknown>
) {
  const source = Object.keys(structuredOutput).length > 0 ? structuredOutput : sharedContextAfter;
  const score = typeof source.score === "number" ? source.score : null;
  const qualified =
    typeof source.qualified === "boolean" ? source.qualified : null;

  if (score !== null && nextMemberName) {
    const threshold = condition?.match(/(\d+)/)?.[1];
    if (threshold) {
      return `Score was ${score} compared against ${threshold} → routed to ${nextMemberName}`;
    }
    return `Score was ${score} → routed to ${nextMemberName}`;
  }

  if (qualified !== null && nextMemberName) {
    return `Qualified was ${qualified ? "true" : "false"} → routed to ${nextMemberName}`;
  }

  return null;
}

function buildRoutingDecision(params: {
  currentStep: {
    taskIndex: number;
    attempt: number;
    status: string;
    memberId: string | null;
    memberName: string;
    role: AgentTeamRole | null;
    approvalRequest: ReplayApprovalRequest | null;
    structuredOutput: Record<string, unknown>;
    sharedContextAfter: Record<string, unknown>;
    agentId: string | null;
  };
  nextStep: {
    memberId: string | null;
    memberName: string;
    taskIndex: number;
    attempt: number;
    agentId: string | null;
  } | null;
  connections: ReplayConnection[];
}): ReplayRoutingData {
  const { currentStep, nextStep, connections } = params;

  if (!nextStep) {
    return {
      type: "none",
      decision: "Execution ended after this step.",
      condition: null,
      comparison: null,
      nextMemberId: null,
      nextMemberName: null,
    };
  }

  if (
    currentStep.taskIndex === nextStep.taskIndex &&
    nextStep.attempt > currentStep.attempt
  ) {
    return {
      type: "retry",
      decision: `Attempt ${currentStep.attempt} failed and the task retried as attempt ${nextStep.attempt}.`,
      condition: null,
      comparison: currentStep.status === "FAILED" ? "Task failure triggered an automatic retry." : null,
      nextMemberId: nextStep.memberId,
      nextMemberName: nextStep.memberName,
    };
  }

  if (currentStep.role === "APPROVAL_GATE" && currentStep.approvalRequest) {
    const decision =
      currentStep.approvalRequest.status === "APPROVED"
        ? `Approved by ${currentStep.approvalRequest.respondedBy || currentStep.approvalRequest.approverEmail} → continued to ${nextStep.memberName}.`
        : currentStep.approvalRequest.status === "SKIPPED"
          ? `Approval gate timed out or was skipped → continued to ${nextStep.memberName}.`
          : currentStep.approvalRequest.status === "REJECTED"
            ? `Rejected by ${currentStep.approvalRequest.respondedBy || currentStep.approvalRequest.approverEmail}.`
            : `Awaiting approval from ${currentStep.approvalRequest.approverEmail}.`;

    return {
      type: "approval",
      decision,
      condition: currentStep.approvalRequest.note || null,
      comparison: null,
      nextMemberId: nextStep.memberId,
      nextMemberName: nextStep.memberName,
    };
  }

  const connection = connections.find(
    (item) =>
      item.sourceMemberId === currentStep.memberId &&
      item.targetMemberId === nextStep.memberId
  );

  if (connection) {
    return {
      type: "orchestration",
      decision: `Condition matched → routed to ${nextStep.memberName}.`,
      condition: connection.condition,
      comparison: buildComparisonText(
        connection.condition,
        nextStep.memberName,
        currentStep.sharedContextAfter,
        currentStep.structuredOutput
      ),
      nextMemberId: nextStep.memberId,
      nextMemberName: nextStep.memberName,
    };
  }

  return {
    type: "sequence",
    decision: `Execution advanced to ${nextStep.memberName}.`,
    condition: null,
    comparison: buildComparisonText(
      null,
      nextStep.memberName,
      currentStep.sharedContextAfter,
      currentStep.structuredOutput
    ),
    nextMemberId: nextStep.memberId,
    nextMemberName: nextStep.memberName,
  };
}

function buildCommonFixSuggestions(error: string | null) {
  if (!error) return [];

  const lowered = error.toLowerCase();
  const suggestions: string[] = [];

  if (
    lowered.includes("token") ||
    lowered.includes("context") ||
    lowered.includes("too long")
  ) {
    suggestions.push(
      "This usually means the prompt is too long. Try reducing previous outputs, shared memory, or RAG context."
    );
  }

  if (lowered.includes("api key") || lowered.includes("require a user api key")) {
    suggestions.push(
      "This usually means the required provider key is missing. Check Settings and connected provider keys."
    );
  }

  if (lowered.includes("returned no output")) {
    suggestions.push(
      "This usually means the model did not produce a usable response. Tighten the prompt and reduce ambiguity."
    );
  }

  if (lowered.includes("approval")) {
    suggestions.push(
      "This step depends on a human approval gate. Check the approver email, timeout behavior, and approval links."
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      "Review the full prompt, input payload, and shared memory for missing context or invalid assumptions."
    );
  }

  return suggestions;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; execId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const timeoutResult = await resolveTimedOutApprovalIfNeeded(
      params.id,
      params.execId
    );
    if (timeoutResult?.resumePromise) {
      waitUntil(
        timeoutResult.resumePromise.catch((error) => {
          console.error("Execution replay timeout resume failed:", error);
        })
      );
    }

    const execution = await prisma.teamExecution.findFirst({
      where: {
        id: params.execId,
        teamId: params.id,
        userId,
      },
      include: {
        team: {
          include: {
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
              orderBy: { level: "asc" },
            },
          },
        },
        logs: {
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                llmModel: true,
                modelProvider: true,
                systemPrompt: true,
              },
            },
            task: {
              select: {
                id: true,
                title: true,
                description: true,
                priority: true,
                assignedToId: true,
              },
            },
          },
          orderBy: [{ taskIndex: "asc" }, { attempt: "asc" }],
        },
        approvalRequests: {
          include: {
            gateMember: {
              include: {
                agent: {
                  select: {
                    id: true,
                    name: true,
                    llmModel: true,
                    modelProvider: true,
                    systemPrompt: true,
                  },
                },
              },
            },
          },
          orderBy: [{ taskIndex: "asc" }, { requestedAt: "asc" }],
        },
      },
    });

    if (!execution) {
      return Response.json({ error: "Execution not found" }, { status: 404 });
    }

    const teamMembers = execution.team.members;
    const memberById = new Map(teamMembers.map((member) => [member.id, member]));
    const approvalByTaskIndex = new Map<number, ReplayApprovalRequest>();
    const approvalRequests: ReplayApprovalRequest[] = execution.approvalRequests.map(
      (request) => {
        const replayRequest: ReplayApprovalRequest = {
          id: request.id,
          taskIndex: request.taskIndex,
          status: request.status,
          approverEmail: request.approverEmail,
          requestedAt: request.requestedAt.toISOString(),
          respondedAt: request.respondedAt?.toISOString() || null,
          respondedBy: request.respondedBy || null,
          note: request.note || null,
          gateMemberId: request.gateMemberId || null,
          gateMemberName: getReplayMemberName(request.gateMember),
        };
        if (!approvalByTaskIndex.has(request.taskIndex)) {
          approvalByTaskIndex.set(request.taskIndex, replayRequest);
        }
        return replayRequest;
      }
    );

    const teamAgentIds = teamMembers
      .map((member) => member.agentId)
      .filter((value): value is string => Boolean(value));

    const orchestrations = await prisma.agentOrchestration.findMany({
      where: {
        sourceAgentId: { in: teamAgentIds },
        targetAgentId: { in: teamAgentIds },
      },
      include: {
        sourceAgent: { select: { id: true, name: true } },
        targetAgent: { select: { id: true, name: true } },
      },
    });

    const memberConnectionMap = new Map<string, ReplayConnection>();
    for (const connection of orchestrations) {
      const sourceMember = teamMembers.find(
        (member) => member.agentId === connection.sourceAgentId
      );
      const targetMember = teamMembers.find(
        (member) => member.agentId === connection.targetAgentId
      );
      if (!sourceMember || !targetMember) continue;

      memberConnectionMap.set(`${sourceMember.id}:${targetMember.id}`, {
        sourceMemberId: sourceMember.id,
        sourceMemberName: getMemberDisplayName(sourceMember),
        targetMemberId: targetMember.id,
        targetMemberName: getMemberDisplayName(targetMember),
        condition: connection.condition,
        enabled: connection.enabled,
      });
    }

    const connections = Array.from(memberConnectionMap.values());

    const rawSteps = await Promise.all(
      execution.logs.map(async (log) => {
        const inputRecord = toPlainObject(log.input);
        const runtimeMeta = getTaskRuntimeMeta(log.input);
        const task = toTaskInput(log, inputRecord);
        const previousOutputs = parsePreviousOutputs(inputRecord.previousOutputs);
        const sharedContextBefore = toPlainObject(inputRecord.sharedContext);
        const sharedContextDelta = {
          ...toPlainObject(log.structuredOutput),
          ...toPlainObject(inputRecord.sharedContextDelta),
        };
        const sharedContextAfter =
          Object.keys(toPlainObject(inputRecord.sharedContextAfter)).length > 0
            ? toPlainObject(inputRecord.sharedContextAfter)
            : { ...sharedContextBefore, ...sharedContextDelta };

        const inputMember =
          inputRecord.assignedMember &&
          typeof inputRecord.assignedMember === "object" &&
          !Array.isArray(inputRecord.assignedMember)
            ? (inputRecord.assignedMember as Record<string, unknown>)
            : null;

        const member =
          (task.assignedToId ? memberById.get(task.assignedToId) : null) ||
          (typeof inputMember?.id === "string"
            ? memberById.get(inputMember.id)
            : null) ||
          null;

        const memberRole =
          member?.role ||
          (typeof inputMember?.role === "string"
            ? (inputMember.role as AgentTeamRole)
            : null);

        const memberName =
          (typeof inputMember?.agentName === "string" && inputMember.agentName) ||
          getReplayMemberName(member);

        const replayMember = member
          ? {
              id: member.id,
              agentId: member.agentId || null,
              role: member.role,
              responsibilities: member.responsibilities,
              agent: member.agent,
              config: member.config,
            }
          : null;

        let knowledgeContext: string[] = [];
        if (member?.agent && member.agent.knowledgeBases.length > 0) {
          try {
            const chunks = await searchRelevantChunks(
              member.agent.id,
              `${task.title}\n${task.description || ""}\n${JSON.stringify(sharedContextBefore)}`,
              5
            );
            knowledgeContext = chunks.map((chunk) => chunk.content);
          } catch {
            knowledgeContext = [];
          }
        }

        const prompt =
          replayMember && memberRole !== "APPROVAL_GATE"
            ? buildPromptData({
                baseSystemPrompt: replayMember.agent?.systemPrompt || "",
                role: replayMember.role,
                teamName: execution.team.name,
                taskMessage: buildTaskMessage(
                  execution.goal || execution.team.goal || "Team execution",
                  task,
                  replayMember as Parameters<typeof buildTaskMessage>[2],
                  previousOutputs,
                  sharedContextBefore
                ),
                sharedContext: sharedContextBefore,
                knowledgeContext,
              })
            : {
                system:
                  approvalByTaskIndex.get(log.taskIndex)?.note ||
                  approvalByTaskIndex.get(log.taskIndex)?.status ||
                  "Human approval gate",
                user:
                  typeof log.error === "string" && log.error.trim()
                    ? log.error
                    : task.description || task.title,
                fullPrompt:
                  "Human approval gate\n\nThis checkpoint paused the execution and waited for a human decision.",
                knowledgeContext: [] as string[],
              };

        return {
          id: log.id,
          taskIndex: log.taskIndex,
          taskId: log.taskId,
          taskTitle: log.taskTitle,
          priority: task.priority,
          attempt: log.attempt,
          memberId: member?.id || (typeof inputMember?.id === "string" ? inputMember.id : null),
          memberName,
          role: memberRole,
          agentId: member?.agentId || log.agentId || null,
          nodeId: log.nodeId ?? null,
          nodeType: log.nodeType ?? null,
          status: log.status,
          startedAt: log.startedAt?.toISOString() || null,
          completedAt: log.completedAt?.toISOString() || null,
          input: log.input,
          output: log.output,
          structuredOutput: sharedContextDelta,
          sharedContextDelta,
          error: log.error,
          previousOutputs,
          sharedContextBefore,
          sharedContextAfter,
          strategy: runtimeMeta.strategy || "primary",
          fallbackEvent: runtimeMeta.fallbackEvent || null,
          prompt,
          metrics: {
            tokensIn: log.tokensIn || 0,
            tokensOut: log.tokensOut || 0,
            model: log.model || null,
            estimatedCost:
              log.estimatedCost ??
              (log.model
                ? estimateCost(log.model, log.tokensIn || 0, log.tokensOut || 0)
                : null),
            responseTimeMs:
              log.startedAt && log.completedAt
                ? log.completedAt.getTime() - log.startedAt.getTime()
                : null,
          },
          approvalRequest: approvalByTaskIndex.get(log.taskIndex) || null,
          commonFixSuggestions: buildCommonFixSuggestions(log.error),
        };
      })
    );

    const steps: ReplayStep[] = rawSteps
      .sort((a, b) => a.taskIndex - b.taskIndex || a.attempt - b.attempt)
      .map((step, index, allSteps) => ({
        ...step,
        routing: buildRoutingDecision({
          currentStep: {
            taskIndex: step.taskIndex,
            attempt: step.attempt,
            status: step.status,
            memberId: step.memberId,
            memberName: step.memberName,
            role: step.role,
            approvalRequest: step.approvalRequest,
            structuredOutput: step.structuredOutput,
            sharedContextAfter: step.sharedContextAfter,
            agentId: step.agentId,
          },
          nextStep:
            allSteps[index + 1]
              ? {
                  memberId: allSteps[index + 1].memberId,
                  memberName: allSteps[index + 1].memberName,
                  taskIndex: allSteps[index + 1].taskIndex,
                  attempt: allSteps[index + 1].attempt,
                  agentId: allSteps[index + 1].agentId,
                }
              : null,
          connections,
        }),
      }));

    const teamReplayMembers: ReplayMember[] = teamMembers.map((member) => ({
      id: member.id,
      agentId: member.agentId || null,
      name: getMemberDisplayName(member),
      role: member.role,
      level: member.level,
      responsibilities: member.responsibilities || null,
      agentMode:
        member.role === "APPROVAL_GATE"
          ? "APPROVAL"
          : member.agent?.agentMode || "TASK",
      llmModel: member.agent?.llmModel || null,
      modelProvider: member.agent?.modelProvider || null,
      systemPrompt: member.agent?.systemPrompt || null,
      reportsToMemberId: member.reportsToMemberId || null,
      outputSchema: member.outputSchema || null,
      enabledActions: member.enabledActions || [],
      config: toPlainObject(member.config),
    }));

    const teamConfig =
      execution.team.config && typeof execution.team.config === "object"
        ? (execution.team.config as Prisma.JsonObject)
        : null;

    const payload: TeamExecutionReplayResponse = {
      execution: {
        id: execution.id,
        teamId: execution.teamId,
        status: execution.status,
        goal: execution.goal || execution.team.goal || null,
        startedAt: execution.startedAt.toISOString(),
        completedAt: execution.completedAt?.toISOString() || null,
        totalTasks: execution.totalTasks,
        completedTasks: execution.completedTasks,
        failedTasks: execution.failedTasks,
        executionContext: stripExecutionContextMeta(
          toPlainObject(execution.executionContext)
        ),
        trigger: getExecutionContextMeta(execution.executionContext).trigger || null,
      },
      team: {
        id: execution.team.id,
        name: execution.team.name,
        goal: execution.team.goal || null,
        description: execution.team.description || null,
        savedPositions: toSavedPositions(teamConfig?.nodePositions),
        members: teamReplayMembers,
        connections,
      },
      steps,
      approvalRequests,
    };

    return Response.json(payload);
  } catch (error) {
    console.error("GET /api/teams/[id]/executions/[execId]/replay error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
