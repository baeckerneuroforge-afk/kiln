import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

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
      orderBy: { startedAt: "desc" },
    });

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
