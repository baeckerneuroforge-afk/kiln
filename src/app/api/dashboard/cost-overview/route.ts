import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Alle Agents des Users
  const agents = await prisma.agent.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      monthlyCostCapCents: true,
    },
  });

  const agentIds = agents.map((a) => a.id);

  if (agentIds.length === 0) {
    return Response.json({
      totalCostCents: 0,
      totalCalls: 0,
      byModel: {},
      byAgent: [],
      dailyCost: [],
      savings: { actualCostCents: 0, hypotheticalOpusCostCents: 0, savedCents: 0, savedPercent: 0 },
    });
  }

  // CostRecords der letzten 30 Tage
  const records = await prisma.costRecord.findMany({
    where: {
      agentId: { in: agentIds },
      timestamp: { gte: thirtyDaysAgo },
    },
    select: {
      agentId: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      costCents: true,
      timestamp: true,
    },
    take: 10000,
  });

  // Aggregationen
  let totalCostCents = 0;
  const byModel: Record<string, { calls: number; costCents: number; inputTokens: number; outputTokens: number }> = {};
  const byAgentMap: Record<string, { totalCostCents: number; callCount: number }> = {};
  const dailyCostMap: Record<string, number> = {};
  let hypotheticalOpusInputTokens = 0;
  let hypotheticalOpusOutputTokens = 0;

  for (const r of records) {
    totalCostCents += r.costCents;
    hypotheticalOpusInputTokens += r.inputTokens;
    hypotheticalOpusOutputTokens += r.outputTokens;

    // By Model
    if (!byModel[r.model]) {
      byModel[r.model] = { calls: 0, costCents: 0, inputTokens: 0, outputTokens: 0 };
    }
    byModel[r.model].calls++;
    byModel[r.model].costCents += r.costCents;
    byModel[r.model].inputTokens += r.inputTokens;
    byModel[r.model].outputTokens += r.outputTokens;

    // By Agent
    if (!byAgentMap[r.agentId]) {
      byAgentMap[r.agentId] = { totalCostCents: 0, callCount: 0 };
    }
    byAgentMap[r.agentId].totalCostCents += r.costCents;
    byAgentMap[r.agentId].callCount++;

    // Daily
    const day = r.timestamp.toISOString().slice(0, 10);
    dailyCostMap[day] = (dailyCostMap[day] || 0) + r.costCents;
  }

  // Hypothetische Opus-only Kosten (Opus: $15/M input, $75/M output)
  const hypotheticalOpusCostCents =
    ((hypotheticalOpusInputTokens / 1_000_000) * 15 + (hypotheticalOpusOutputTokens / 1_000_000) * 75) * 100;
  const savedCents = Math.max(0, hypotheticalOpusCostCents - totalCostCents);
  const savedPercent = hypotheticalOpusCostCents > 0
    ? Math.round(((hypotheticalOpusCostCents - totalCostCents) / hypotheticalOpusCostCents) * 100)
    : 0;

  // Per-Agent summaries
  const byAgent = agents.map((agent) => {
    const usage = byAgentMap[agent.id] || { totalCostCents: 0, callCount: 0 };
    const percentUsed = agent.monthlyCostCapCents && agent.monthlyCostCapCents > 0
      ? Math.min(100, Math.round((usage.totalCostCents / agent.monthlyCostCapCents) * 100))
      : null;

    return {
      agentId: agent.id,
      agentName: agent.name,
      totalCostCents: Math.round(usage.totalCostCents * 100) / 100,
      callCount: usage.callCount,
      budgetCapCents: agent.monthlyCostCapCents,
      percentUsed,
    };
  }).filter((a) => a.callCount > 0);

  const dailyCost = Object.entries(dailyCostMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, costCents]) => ({ date, costCents: Math.round(costCents * 100) / 100 }));

  return Response.json({
    totalCostCents: Math.round(totalCostCents * 100) / 100,
    totalCalls: records.length,
    byModel,
    byAgent,
    dailyCost,
    savings: {
      actualCostCents: Math.round(totalCostCents * 100) / 100,
      hypotheticalOpusCostCents: Math.round(hypotheticalOpusCostCents * 100) / 100,
      savedCents: Math.round(savedCents * 100) / 100,
      savedPercent: Math.max(0, savedPercent),
    },
  });
}
