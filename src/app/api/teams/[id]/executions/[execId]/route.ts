import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
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
    startedAt: Date | null;
    completedAt: Date | null;
    error: string | null;
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
  const grouped = new Map<number, {
    taskIndex: number;
    taskId: string | null;
    taskTitle: string;
    priority: string;
    assignedToId: string | null;
    assignedAgentName: string | null;
    latestStatus: string;
    latestOutput: string | null;
    latestError: string | null;
    attempts: Array<{
      id: string;
      attempt: number;
      status: string;
      input: unknown;
      output: string | null;
      error: string | null;
      startedAt: Date | null;
      completedAt: Date | null;
      durationMs: number | null;
      agent: { id: string; name: string } | null;
    }>;
  }>();

  for (const log of logs) {
    const existing = grouped.get(log.taskIndex) || {
      taskIndex: log.taskIndex,
      taskId: log.taskId,
      taskTitle: log.taskTitle,
      priority: log.task?.priority || "MEDIUM",
      assignedToId: log.task?.assignedToId || null,
      assignedAgentName: log.agent?.name || null,
      latestStatus: log.status,
      latestOutput: log.output,
      latestError: log.error,
      attempts: [],
    };

    existing.attempts.push({
      id: log.id,
      attempt: log.attempt,
      status: log.status,
      input: log.input,
      output: log.output,
      error: log.error,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      durationMs: log.startedAt && log.completedAt
        ? log.completedAt.getTime() - log.startedAt.getTime()
        : null,
      agent: log.agent,
    });

    existing.latestStatus = log.status;
    existing.latestOutput = log.output;
    existing.latestError = log.error;
    existing.assignedAgentName = log.agent?.name || existing.assignedAgentName;

    grouped.set(log.taskIndex, existing);
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.taskIndex - b.taskIndex)
    .map((task) => ({
      ...task,
      attempts: task.attempts.sort((a, b) => a.attempt - b.attempt),
    }));
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
        durationMs: execution.completedAt
          ? execution.completedAt.getTime() - execution.startedAt.getTime()
          : null,
      },
      timeline: groupExecutionTimeline(execution.logs),
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
