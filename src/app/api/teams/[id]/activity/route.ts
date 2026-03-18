import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canAccessTeam } from "@/lib/team-permissions";

interface ActivityEntry {
  id: string;
  type: "execution" | "config_change" | "comment" | "version_save" | "rollback";
  title: string;
  detail?: string;
  author?: string;
  authorName?: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await canAccessTeam(params.id, userId))) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    // Fetch recent executions, versions, and build activity feed
    const [executions, versions] = await Promise.all([
      prisma.teamExecution.findMany({
        where: { teamId: params.id },
        orderBy: { startedAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          goal: true,
          startedAt: true,
          completedAt: true,
          totalTasks: true,
          completedTasks: true,
          userId: true,
        },
      }),
      prisma.teamVersion.findMany({
        where: { teamId: params.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const activities: ActivityEntry[] = [];

    // Execution activities
    for (const exec of executions) {
      const duration = exec.completedAt
        ? ((new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000).toFixed(1)
        : null;

      let title: string;
      switch (exec.status) {
        case "COMPLETED":
          title = `Workflow completed${duration ? ` in ${duration}s` : ""}`;
          break;
        case "FAILED":
          title = "Workflow execution failed";
          break;
        case "RUNNING":
          title = `Workflow running — ${exec.completedTasks}/${exec.totalTasks} tasks`;
          break;
        case "AWAITING_APPROVAL":
          title = "Workflow paused — awaiting approval";
          break;
        default:
          title = `Workflow ${exec.status.toLowerCase()}`;
      }

      activities.push({
        id: `exec-${exec.id}`,
        type: "execution",
        title,
        detail: exec.goal || undefined,
        author: exec.userId,
        timestamp: exec.startedAt.toISOString(),
        meta: { executionId: exec.id, status: exec.status },
      });
    }

    // Version activities
    for (const ver of versions) {
      const isRollback = ver.changelog.startsWith("Auto-saved before rollback");
      activities.push({
        id: `ver-${ver.id}`,
        type: isRollback ? "rollback" : "version_save",
        title: isRollback
          ? `Rolled back workflow — ${ver.changelog}`
          : `Saved version v${ver.version}`,
        detail: ver.note || ver.changelog,
        author: ver.createdBy,
        timestamp: ver.createdAt.toISOString(),
        meta: { version: ver.version },
      });
    }

    // Sort by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return Response.json({
      activities: activities.slice(0, 30),
    });
  } catch (err) {
    console.error("GET /api/teams/[id]/activity error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
