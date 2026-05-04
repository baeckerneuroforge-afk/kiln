import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Alle aktiven + kürzlich abgeschlossenen Executions laden
    const executions = await prisma.teamExecution.findMany({
      where: {
        userId,
        OR: [
          { status: "RUNNING" },
          { status: "AWAITING_APPROVAL" },
          { startedAt: { gte: twentyFourHoursAgo } },
        ],
      },
      include: {
        team: { select: { id: true, name: true } },
        logs: {
          orderBy: [{ taskIndex: "asc" }, { attempt: "desc" }],
          include: {
            agent: { select: { id: true, name: true } },
          },
        },
        approvalRequests: {
          where: { status: "PENDING" },
          select: {
            id: true,
            token: true,
            taskIndex: true,
            approverEmail: true,
            requestedAt: true,
          },
        },
      },
      orderBy: { startedAt: "desc" },
      take: 100,
    });

    // Aktuelle Schritte bestimmen
    const items = executions.map((exec) => {
      const latestLog = exec.logs.length > 0 ? exec.logs[exec.logs.length - 1] : null;
      const runningLog = exec.logs.find((l) => l.status === "RUNNING");
      const currentAgent = runningLog?.agent || latestLog?.agent || null;
      const currentStep = runningLog?.taskTitle || latestLog?.taskTitle || null;
      const currentStepIndex = runningLog?.taskIndex ?? latestLog?.taskIndex ?? 0;

      // Kosten bisher (nur abgeschlossene Logs)
      const costSoFar = exec.logs
        .filter((l) => l.status === "COMPLETED" && typeof l.estimatedCost === "number")
        .reduce((sum, l) => sum + (l.estimatedCost ?? 0), 0);

      return {
        id: exec.id,
        teamId: exec.teamId,
        teamName: exec.team.name,
        status: exec.status,
        goal: exec.goal,
        startedAt: exec.startedAt,
        completedAt: exec.completedAt,
        totalTasks: exec.totalTasks,
        completedTasks: exec.completedTasks,
        failedTasks: exec.failedTasks,
        elapsedMs: exec.completedAt
          ? exec.completedAt.getTime() - exec.startedAt.getTime()
          : now.getTime() - exec.startedAt.getTime(),
        currentAgent: currentAgent
          ? { id: currentAgent.id, name: currentAgent.name }
          : null,
        currentStep,
        currentStepIndex,
        costSoFar,
        pendingApprovals: exec.approvalRequests,
      };
    });

    // Zusammenfassungs-Statistiken
    const runningNow = items.filter((i) => i.status === "RUNNING").length;
    const awaitingApproval = items.filter((i) => i.status === "AWAITING_APPROVAL").length;
    const completedToday = items.filter(
      (i) => (i.status === "COMPLETED" || i.status === "PARTIAL") && i.completedAt && new Date(i.completedAt) >= startOfDay
    ).length;
    const failedToday = items.filter(
      (i) => i.status === "FAILED" && i.completedAt && new Date(i.completedAt) >= startOfDay
    ).length;

    // Stündliche Verteilung der letzten 24 Stunden
    const hourlyBuckets: { hour: string; completed: number; failed: number; running: number }[] = [];
    for (let h = 23; h >= 0; h--) {
      const bucketStart = new Date(now.getTime() - h * 60 * 60 * 1000);
      const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
      const label = bucketStart.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

      const inBucket = items.filter((i) => {
        const t = new Date(i.startedAt);
        return t >= bucketStart && t < bucketEnd;
      });

      hourlyBuckets.push({
        hour: label,
        completed: inBucket.filter((i) => i.status === "COMPLETED" || i.status === "PARTIAL").length,
        failed: inBucket.filter((i) => i.status === "FAILED").length,
        running: inBucket.filter((i) => i.status === "RUNNING" || i.status === "AWAITING_APPROVAL").length,
      });
    }

    return Response.json({
      summary: { runningNow, awaitingApproval, completedToday, failedToday },
      executions: items,
      hourlyTimeline: hourlyBuckets,
    });
  } catch (err) {
    console.error("GET /api/teams/monitor error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
