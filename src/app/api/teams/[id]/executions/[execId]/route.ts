import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getExecutionContextMeta,
  getTaskRuntimeMeta,
  stripExecutionContextMeta,
} from "@/lib/team-execution-metadata";
import { resolveTimedOutApprovalIfNeeded } from "@/lib/services/team-approval-runtime";
import {
  executeTeamExecution,
  loadTeamExecutionRuntimeContext,
  type TeamExecutionTaskInput,
} from "@/lib/services/team-runtime";

function groupExecutionTimeline(
  logs: Array<{
    id: string;
    taskId: string | null;
    taskIndex: number;
    taskTitle: string;
    attempt: number;
    status: string;
    input: unknown;
    output: string | null;
    structuredOutput: unknown;
    startedAt: Date | null;
    completedAt: Date | null;
    error: string | null;
    parallelGroup: string | null;
    nodeId: string | null;
    nodeType: string | null;
    agent: { id: string; name: string } | null;
    task: {
      id: string;
      title: string;
      description: string | null;
      priority: string;
      assignedToId: string | null;
      status: string;
      result: string | null;
    } | null;
  }>
) {
  const grouped = new Map<string, {
    taskIndex: number;
    taskId: string | null;
    taskTitle: string;
    priority: string;
    assignedToId: string | null;
    assignedAgentName: string | null;
    latestStatus: string;
    latestOutput: string | null;
    latestError: string | null;
    parallelGroup: string | null;
    nodeId: string | null;
    nodeType: string | null;
    attempts: Array<{
      id: string;
      attempt: number;
      status: string;
      input: unknown;
      output: string | null;
      structuredOutput: unknown;
      error: string | null;
      strategy: string;
      fallbackEvent: string | null;
      startedAt: Date | null;
      completedAt: Date | null;
      durationMs: number | null;
      nodeId: string | null;
      nodeType: string | null;
      agent: { id: string; name: string } | null;
    }>;
  }>();

  for (const log of logs) {
    const runtimeMeta = getTaskRuntimeMeta(log.input);
    const groupKey = log.nodeId || String(log.taskIndex);
    const existing = grouped.get(groupKey) || {
      taskIndex: log.taskIndex,
      taskId: log.taskId,
      taskTitle: log.taskTitle,
      priority: log.task?.priority || "MEDIUM",
      assignedToId: log.task?.assignedToId || null,
      assignedAgentName: log.agent?.name || null,
      latestStatus: log.status,
      latestOutput: log.output,
      latestError: log.error,
      parallelGroup: log.parallelGroup || null,
      nodeId: log.nodeId || null,
      nodeType: log.nodeType || null,
      attempts: [],
    };

    existing.attempts.push({
      id: log.id,
      attempt: log.attempt,
      status: log.status,
      input: log.input,
      output: log.output,
      structuredOutput: log.structuredOutput,
      error: log.error,
      strategy: runtimeMeta.strategy || "primary",
      fallbackEvent: runtimeMeta.fallbackEvent || null,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      durationMs: log.startedAt && log.completedAt
        ? log.completedAt.getTime() - log.startedAt.getTime()
        : null,
      nodeId: log.nodeId || null,
      nodeType: log.nodeType || null,
      agent: log.agent,
    });

    existing.latestStatus = log.status;
    existing.latestOutput = log.output;
    existing.latestError = log.error;
    existing.assignedAgentName = log.agent?.name || existing.assignedAgentName;

    grouped.set(groupKey, existing);
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.taskIndex - b.taskIndex)
    .map((task) => ({
      ...task,
      attempts: task.attempts.sort((a, b) => a.attempt - b.attempt),
    }));
}

function buildSharedContextTimeline(
  logs: Array<{
    taskIndex: number;
    taskTitle: string;
    structuredOutput: unknown;
    startedAt: Date | null;
    completedAt: Date | null;
    nodeId: string | null;
    nodeType: string | null;
    agent: { id: string; name: string } | null;
  }>
) {
  return logs
    .flatMap((log) => {
      const structured =
        log.structuredOutput &&
        typeof log.structuredOutput === "object" &&
        !Array.isArray(log.structuredOutput)
          ? (log.structuredOutput as Record<string, unknown>)
          : {};

      return Object.entries(structured).map(([key, value]) => ({
        key,
        value,
        taskIndex: log.taskIndex,
        taskTitle: log.taskTitle,
        addedAt: log.completedAt || log.startedAt,
        addedBy: log.agent?.name || (log.nodeType ? `${log.nodeType} (${log.nodeId})` : "Approval Gate"),
      }));
    })
    .sort((a, b) => {
      const aTime = a.addedAt ? a.addedAt.getTime() : 0;
      const bTime = b.addedAt ? b.addedAt.getTime() : 0;
      return aTime - bTime;
    });
}

function getApprovalGateDisplayName(gateMember: {
  agent?: { name: string } | null;
  config?: unknown;
} | null) {
  if (!gateMember) return "Approval Gate";
  if (gateMember.agent?.name) return gateMember.agent.name;

  const config =
    gateMember.config &&
    typeof gateMember.config === "object" &&
    !Array.isArray(gateMember.config)
      ? (gateMember.config as Record<string, unknown>)
      : null;

  return typeof config?.label === "string" && config.label.trim()
    ? config.label.trim()
    : "Approval Gate";
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
          console.error("Execution timeout resume failed:", error);
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
        logs: {
          include: {
            agent: { select: { id: true, name: true } },
            task: {
              select: {
                id: true,
                title: true,
                description: true,
                priority: true,
                assignedToId: true,
                status: true,
                result: true,
              },
            },
          },
          orderBy: [{ taskIndex: "asc" }, { attempt: "asc" }],
        },
        approvalRequests: {
          include: {
            gateMember: {
              include: {
                agent: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { requestedAt: "desc" },
        },
      },
    });

    if (!execution) {
      return Response.json({ error: "Execution not found" }, { status: 404 });
    }

    return Response.json({
      execution: {
        id: execution.id,
        teamId: execution.teamId,
        status: execution.status,
        goal: execution.goal,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        totalTasks: execution.totalTasks,
        completedTasks: execution.completedTasks,
        failedTasks: execution.failedTasks,
        executionContext: stripExecutionContextMeta(
          execution.executionContext && typeof execution.executionContext === "object"
            ? (execution.executionContext as Record<string, unknown>)
            : {}
        ),
        trigger: getExecutionContextMeta(execution.executionContext).trigger || null,
        durationMs: execution.completedAt
          ? execution.completedAt.getTime() - execution.startedAt.getTime()
          : null,
      },
      timeline: groupExecutionTimeline(execution.logs),
      sharedContextTimeline: buildSharedContextTimeline(execution.logs),
      approvalRequests: execution.approvalRequests.map((request) => ({
        id: request.id,
        token: request.token,
        taskIndex: request.taskIndex,
        status: request.status,
        approverEmail: request.approverEmail,
        requestedAt: request.requestedAt,
        respondedAt: request.respondedAt,
        respondedBy: request.respondedBy,
        note: request.note,
        gateMember: request.gateMember
          ? {
              id: request.gateMember.id,
              role: request.gateMember.role,
              name: getApprovalGateDisplayName(request.gateMember),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("GET /api/teams/[id]/executions/[execId] error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; execId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const execution = await prisma.teamExecution.findFirst({
      where: {
        id: params.execId,
        teamId: params.id,
        userId,
      },
      include: {
        logs: {
          include: {
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
      },
    });

    if (!execution) {
      return Response.json({ error: "Execution not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedTaskIndex = typeof body.taskIndex === "number" ? body.taskIndex : null;

    const latestLogsByTask = new Map<number, (typeof execution.logs)[number]>();
    for (const log of execution.logs) {
      latestLogsByTask.set(log.taskIndex, log);
    }

    const failedLogs = Array.from(latestLogsByTask.values()).filter(
      (log) => log.status === "FAILED" && (requestedTaskIndex === null || log.taskIndex === requestedTaskIndex)
    );

    if (failedLogs.length === 0) {
      return Response.json(
        { error: "No failed tasks available for re-run." },
        { status: 400 }
      );
    }

    const team = await loadTeamExecutionRuntimeContext(params.id, userId);
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const rerunExecution = await prisma.teamExecution.create({
      data: {
        teamId: team.id,
        userId,
        goal: execution.goal || team.goal || "Re-run failed team tasks",
        totalTasks: failedLogs.length,
        taskPlan: failedLogs.map((log) => ({
          id: log.task?.id || log.taskId || `task-${log.taskIndex}`,
          title: log.task?.title || log.taskTitle,
          description: log.task?.description || null,
          priority: log.task?.priority || "MEDIUM",
          assignedToId: log.task?.assignedToId || null,
          taskIndex: log.taskIndex,
        })),
        executionContext: execution.executionContext || {},
      },
    });

    const priorOutputs = Array.from(latestLogsByTask.values())
      .filter((log) => log.status === "COMPLETED" && typeof log.output === "string" && log.output.trim())
      .map((log) => ({
        taskIndex: log.taskIndex,
        title: log.taskTitle,
        output: log.output!,
      }));

    const rerunTasks: TeamExecutionTaskInput[] = failedLogs.map((log) => ({
      id: log.task?.id || log.taskId || `task-${log.taskIndex}`,
      title: log.task?.title || log.taskTitle,
      description: log.task?.description || null,
      priority: log.task?.priority || "MEDIUM",
      assignedToId: log.task?.assignedToId || null,
      taskIndex: log.taskIndex,
    }));

    waitUntil(
      executeTeamExecution({
        executionId: rerunExecution.id,
        team,
        userId,
        goal: execution.goal || team.goal || "Re-run failed team tasks",
        tasks: rerunTasks,
        priorOutputs,
        executionContext:
          execution.executionContext && typeof execution.executionContext === "object"
            ? (execution.executionContext as Record<string, unknown>)
            : {},
      }).catch((error) => {
        console.error("Background team rerun failed:", error);
      })
    );

    return Response.json(
      {
        executionId: rerunExecution.id,
        status: rerunExecution.status,
        rerunCount: rerunTasks.length,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("POST /api/teams/[id]/executions/[execId] error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
