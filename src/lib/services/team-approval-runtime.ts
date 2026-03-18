import {
  ApprovalRequestStatus,
  TeamExecutionStatus,
  TeamExecutionTaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  executeTeamExecution,
  loadApprovalExecutionByToken,
  loadTeamExecutionRuntimeContext,
  type TeamExecutionTaskInput,
  type TeamSharedContext,
} from "@/lib/services/team-runtime";
import {
  getApprovalDeadline,
  isApprovalTimedOut,
  normalizeApprovalGateConfig,
} from "@/lib/team-approval";

type LoadedApprovalExecution = NonNullable<
  Awaited<ReturnType<typeof loadApprovalExecutionByToken>>
>;

type ApprovalResolutionMode = "approve" | "skip" | "reject";

function toPlainContext(value: unknown): TeamSharedContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as TeamSharedContext;
}

function parseTaskPlan(taskPlan: unknown): TeamExecutionTaskInput[] {
  if (!Array.isArray(taskPlan)) {
    return [];
  }

  return taskPlan
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      return {
        id: typeof record.id === "string" ? record.id : `task-${index}`,
        title: typeof record.title === "string" ? record.title : `Task ${index + 1}`,
        description:
          typeof record.description === "string" ? record.description : null,
        priority:
          typeof record.priority === "string" ? record.priority : "MEDIUM",
        assignedToId:
          typeof record.assignedToId === "string" ? record.assignedToId : null,
        taskIndex:
          typeof record.taskIndex === "number" ? record.taskIndex : index,
      };
    })
    .filter((item): item is TeamExecutionTaskInput => Boolean(item))
    .sort((a, b) => a.taskIndex - b.taskIndex);
}

function latestLogByTask(
  logs: LoadedApprovalExecution["execution"]["logs"]
) {
  const map = new Map<number, LoadedApprovalExecution["execution"]["logs"][number]>();
  for (const log of logs) {
    const current = map.get(log.taskIndex);
    if (!current || log.attempt >= current.attempt) {
      map.set(log.taskIndex, log);
    }
  }
  return map;
}

function buildPriorOutputs(logs: LoadedApprovalExecution["execution"]["logs"]) {
  const latest = Array.from(latestLogByTask(logs).values());
  return latest
    .filter(
      (log) => log.status === "COMPLETED" && typeof log.output === "string" && log.output.trim()
    )
    .sort((a, b) => a.taskIndex - b.taskIndex)
    .map((log) => ({
      taskIndex: log.taskIndex,
      title: log.taskTitle,
      output: log.output!,
    }));
}

async function loadLatestApprovalExecution(
  teamId: string,
  executionId: string
) {
  const execution = await prisma.teamExecution.findFirst({
    where: {
      id: executionId,
      teamId,
    },
    include: {
      team: {
        include: {
          members: {
            include: {
              agent: {
                include: {
                  knowledgeBases: { where: { embeddingStatus: "READY" } },
                },
              },
            },
            orderBy: { level: "asc" },
          },
        },
      },
      logs: {
        include: {
          agent: { select: { id: true, name: true } },
        },
        orderBy: [{ taskIndex: "asc" }, { attempt: "asc" }],
      },
      approvalRequests: {
        include: {
          gateMember: {
            include: {
              agent: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { requestedAt: "desc" },
      },
    },
  });

  if (!execution) {
    return null;
  }

  const approvalRequest =
    execution.approvalRequests.find((request) => request.status === "PENDING") ||
    execution.approvalRequests[0] ||
    null;

  if (!approvalRequest) {
    return null;
  }

  return {
    execution,
    team: execution.team,
    approvalRequest,
  };
}

async function loadApprovalExecutionState(
  teamId: string,
  executionId: string,
  token?: string
) {
  if (token) {
    return loadApprovalExecutionByToken(teamId, executionId, token);
  }

  return loadLatestApprovalExecution(teamId, executionId);
}

async function resolveApproval(
  loaded: LoadedApprovalExecution,
  mode: ApprovalResolutionMode,
  respondedBy: string,
  note?: string
) {
  const { execution, team, approvalRequest } = loaded;
  const latestLogs = latestLogByTask(execution.logs);
  const gateLog = latestLogs.get(approvalRequest.taskIndex) || null;
  const resolutionText =
    mode === "reject"
      ? note?.trim() || "Execution rejected by approver."
      : mode === "skip"
        ? note?.trim() || "Approval gate skipped."
        : note?.trim() || "Execution approved.";

  if (mode === "reject") {
    await prisma.$transaction([
      prisma.approvalRequest.update({
        where: { id: approvalRequest.id },
        data: {
          status: ApprovalRequestStatus.REJECTED,
          respondedAt: new Date(),
          respondedBy,
          note: resolutionText,
        },
      }),
      prisma.teamExecution.update({
        where: { id: execution.id },
        data: {
          status: TeamExecutionStatus.REJECTED,
          completedAt: new Date(),
        },
      }),
      ...(gateLog
        ? [
            prisma.teamExecutionLog.update({
              where: { id: gateLog.id },
              data: {
                status: TeamExecutionTaskStatus.REJECTED,
                error: resolutionText,
                completedAt: new Date(),
              },
            }),
            ...(gateLog.taskId
              ? [
                  prisma.agentTeamTask.update({
                    where: { id: gateLog.taskId },
                    data: {
                      status: "REJECTED",
                      result: resolutionText.slice(0, 5000),
                    },
                  }),
                ]
              : []),
          ]
        : []),
    ]);

    return {
      executionId: execution.id,
      status: TeamExecutionStatus.REJECTED,
      resumePromise: null as Promise<void> | null,
    };
  }

  await prisma.$transaction([
    prisma.approvalRequest.update({
      where: { id: approvalRequest.id },
      data: {
        status:
          mode === "approve"
            ? ApprovalRequestStatus.APPROVED
            : ApprovalRequestStatus.SKIPPED,
        respondedAt: new Date(),
        respondedBy,
        note: resolutionText,
      },
    }),
    prisma.teamExecution.update({
      where: { id: execution.id },
      data: {
        status: TeamExecutionStatus.RUNNING,
        completedAt: null,
      },
    }),
    ...(gateLog
      ? [
          prisma.teamExecutionLog.update({
            where: { id: gateLog.id },
            data: {
              status:
                mode === "approve"
                  ? TeamExecutionTaskStatus.COMPLETED
                  : TeamExecutionTaskStatus.SKIPPED,
              output: resolutionText,
              completedAt: new Date(),
            },
          }),
          ...(gateLog.taskId
            ? [
                prisma.agentTeamTask.update({
                  where: { id: gateLog.taskId },
                  data: {
                    status: mode === "approve" ? "COMPLETED" : "SKIPPED",
                    result: resolutionText.slice(0, 5000),
                  },
                }),
              ]
            : []),
        ]
      : []),
  ]);

  const taskPlan = parseTaskPlan(execution.taskPlan);
  const remainingTasks = taskPlan.filter(
    (task) => task.taskIndex > approvalRequest.taskIndex
  );

  if (remainingTasks.length === 0) {
    const finalStatus =
      execution.failedTasks > 0
        ? execution.completedTasks > 0
          ? TeamExecutionStatus.PARTIAL
          : TeamExecutionStatus.FAILED
        : TeamExecutionStatus.COMPLETED;

    await prisma.teamExecution.update({
      where: { id: execution.id },
      data: {
        status: finalStatus,
        completedAt: new Date(),
      },
    });

    return {
      executionId: execution.id,
      status: finalStatus,
      resumePromise: null as Promise<void> | null,
    };
  }

  const runtimeTeam = await loadTeamExecutionRuntimeContext(team.id, execution.userId);
  if (!runtimeTeam) {
    throw new Error("Team runtime context could not be loaded.");
  }

  const resumePromise = executeTeamExecution({
    executionId: execution.id,
    team: runtimeTeam,
    userId: execution.userId,
    goal: execution.goal || team.goal || "Resume team execution",
    tasks: remainingTasks,
    priorOutputs: buildPriorOutputs(execution.logs),
    executionContext: toPlainContext(execution.executionContext),
    initialCompletedTasks: execution.completedTasks,
    initialFailedTasks: execution.failedTasks,
  });

  return {
    executionId: execution.id,
    status: TeamExecutionStatus.RUNNING,
    resumePromise,
  };
}

export async function resolveTimedOutApprovalIfNeeded(
  teamId: string,
  executionId: string,
  token?: string
) {
  const loaded = await loadApprovalExecutionState(teamId, executionId, token);
  if (!loaded) {
    return null;
  }

  const { approvalRequest } = loaded;
  if (approvalRequest.status !== ApprovalRequestStatus.PENDING) {
    return {
      executionId: loaded.execution.id,
      status: loaded.execution.status,
      loaded,
      resumePromise: null as Promise<void> | null,
      handled: false,
    };
  }

  const config = normalizeApprovalGateConfig(
    approvalRequest.gateMember?.config,
    approvalRequest.approverEmail
  );

  if (!isApprovalTimedOut(approvalRequest.requestedAt, config)) {
    return {
      executionId: loaded.execution.id,
      status: loaded.execution.status,
      loaded,
      resumePromise: null as Promise<void> | null,
      handled: false,
    };
  }

  const mode: ApprovalResolutionMode =
    config.timeoutAction === "auto_reject"
      ? "reject"
      : config.timeoutAction === "auto_approve"
        ? "approve"
        : "skip";

  const result = await resolveApproval(
    loaded,
    mode,
    "timeout",
    `Approval timed out on ${getApprovalDeadline(
      approvalRequest.requestedAt,
      config
    ).toLocaleString()}.`
  );

  return {
    ...result,
    loaded: await loadApprovalExecutionState(teamId, executionId, token),
    handled: true,
  };
}

export async function approveApprovalByToken(params: {
  teamId: string;
  executionId: string;
  token: string;
  note?: string;
  respondedBy?: string;
}) {
  const loaded = await loadApprovalExecutionByToken(
    params.teamId,
    params.executionId,
    params.token
  );
  if (!loaded) {
    throw new Error("Approval request not found.");
  }

  if (loaded.approvalRequest.status !== ApprovalRequestStatus.PENDING) {
    return {
      executionId: loaded.execution.id,
      status: loaded.execution.status,
      resumePromise: null as Promise<void> | null,
    };
  }

  return resolveApproval(
    loaded,
    "approve",
    params.respondedBy || loaded.approvalRequest.approverEmail,
    params.note
  );
}

export async function rejectApprovalByToken(params: {
  teamId: string;
  executionId: string;
  token: string;
  note?: string;
  respondedBy?: string;
}) {
  const loaded = await loadApprovalExecutionByToken(
    params.teamId,
    params.executionId,
    params.token
  );
  if (!loaded) {
    throw new Error("Approval request not found.");
  }

  if (loaded.approvalRequest.status !== ApprovalRequestStatus.PENDING) {
    return {
      executionId: loaded.execution.id,
      status: loaded.execution.status,
      resumePromise: null as Promise<void> | null,
    };
  }

  return resolveApproval(
    loaded,
    "reject",
    params.respondedBy || loaded.approvalRequest.approverEmail,
    params.note
  );
}
