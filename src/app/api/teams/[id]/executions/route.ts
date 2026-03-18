import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getExecutionContextMeta,
  stripExecutionContextMeta,
} from "@/lib/team-execution-metadata";
import { resolveTimedOutApprovalIfNeeded } from "@/lib/services/team-approval-runtime";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });

    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const executions = await prisma.teamExecution.findMany({
      where: { teamId: params.id, userId },
      include: {
        approvalRequests: {
          orderBy: { requestedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { startedAt: "desc" },
    });

    for (const execution of executions) {
      if (execution.status === "AWAITING_APPROVAL") {
        waitUntil(
          resolveTimedOutApprovalIfNeeded(params.id, execution.id)
            .then((result) => result?.resumePromise)
            .then((resumePromise) => resumePromise)
            .catch((error) => {
              console.error("Execution approval timeout resolution failed:", error);
            })
        );
      }
    }

    return Response.json({
      executions: executions.map((execution) => ({
        id: execution.id,
        status: execution.status,
        goal: execution.goal,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        totalTasks: execution.totalTasks,
        completedTasks: execution.completedTasks,
        failedTasks: execution.failedTasks,
        trigger: getExecutionContextMeta(execution.executionContext).trigger || null,
        sharedContextFields:
          execution.executionContext && typeof execution.executionContext === "object"
            ? Object.keys(
                stripExecutionContextMeta(
                  execution.executionContext as Record<string, unknown>
                )
              ).length
            : 0,
        latestApproval: execution.approvalRequests[0]
          ? {
              id: execution.approvalRequests[0].id,
              status: execution.approvalRequests[0].status,
              approverEmail: execution.approvalRequests[0].approverEmail,
              requestedAt: execution.approvalRequests[0].requestedAt,
              respondedAt: execution.approvalRequests[0].respondedAt,
              respondedBy: execution.approvalRequests[0].respondedBy,
            }
          : null,
        durationMs: execution.completedAt
          ? execution.completedAt.getTime() - execution.startedAt.getTime()
          : null,
      })),
    });
  } catch (error) {
    console.error("GET /api/teams/[id]/executions error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
