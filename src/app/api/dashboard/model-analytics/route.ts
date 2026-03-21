import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getCostSummary } from "@/lib/smart-model-router";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // In-memory Cost-Summary (letzte 24h)
  const summary = getCostSummary(24);

  // DB-basierte Daten: TeamExecutionLogs mit model-Info
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const logs = await prisma.teamExecutionLog.findMany({
    where: {
      teamId: { in: (await prisma.agentTeam.findMany({ where: { userId }, select: { id: true } })).map((t) => t.id) },
      startedAt: { gte: thirtyDaysAgo },
      model: { not: null },
    },
    select: {
      model: true,
      tokensIn: true,
      tokensOut: true,
      estimatedCost: true,
      startedAt: true,
    },
    take: 5000,
  });

  // Aggregiere nach Modell
  const byModel: Record<string, { calls: number; tokensIn: number; tokensOut: number; cost: number }> = {};
  let totalCostMonth = 0;

  for (const log of logs) {
    const model = log.model || "unknown";
    if (!byModel[model]) {
      byModel[model] = { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
    }
    byModel[model].calls++;
    byModel[model].tokensIn += log.tokensIn || 0;
    byModel[model].tokensOut += log.tokensOut || 0;
    byModel[model].cost += log.estimatedCost || 0;
    totalCostMonth += log.estimatedCost || 0;
  }

  // Geschätzte Einsparungen: Differenz zu "alles mit Opus" Szenario
  const opusCostPer1K = 0.075;
  let hypotheticalOpusCost = 0;
  for (const log of logs) {
    const totalTokens = (log.tokensIn || 0) + (log.tokensOut || 0);
    hypotheticalOpusCost += (totalTokens / 1000) * opusCostPer1K;
  }
  const savings = Math.max(0, hypotheticalOpusCost - totalCostMonth);

  // Parallel-Execution Stats
  const parallelExecutions = await prisma.parallelExecution.count({
    where: {
      startedAt: { gte: thirtyDaysAgo },
    },
  });

  return Response.json({
    realtime: summary,
    monthly: {
      byModel,
      totalCost: totalCostMonth,
      totalCalls: logs.length,
      savings: Math.round(savings * 100) / 100,
      hypotheticalOpusCost: Math.round(hypotheticalOpusCost * 100) / 100,
    },
    parallel: {
      totalExecutions: parallelExecutions,
    },
  });
}
