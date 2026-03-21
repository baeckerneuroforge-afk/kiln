import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      maxCostPerRunCents: true,
      monthlyCostCapCents: true,
      budgetExceededBehavior: true,
    },
  });
  if (!agent) return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });

  // Monatliche Kosten aggregieren
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyResult = await prisma.costRecord.aggregate({
    where: {
      agentId: params.id,
      timestamp: { gte: startOfMonth },
    },
    _sum: { costCents: true },
    _count: true,
  });

  // Kosten der letzten 30 Tage nach Modell
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const records = await prisma.costRecord.findMany({
    where: {
      agentId: params.id,
      timestamp: { gte: thirtyDaysAgo },
    },
    select: {
      model: true,
      inputTokens: true,
      outputTokens: true,
      costCents: true,
      timestamp: true,
    },
    take: 5000,
  });

  // Nach Modell aggregieren
  const byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; costCents: number }> = {};
  for (const r of records) {
    if (!byModel[r.model]) {
      byModel[r.model] = { calls: 0, inputTokens: 0, outputTokens: 0, costCents: 0 };
    }
    byModel[r.model].calls++;
    byModel[r.model].inputTokens += r.inputTokens;
    byModel[r.model].outputTokens += r.outputTokens;
    byModel[r.model].costCents += r.costCents;
  }

  // Daily trend (letzten 14 Tage)
  const dailyCost: Record<string, number> = {};
  for (const r of records) {
    const day = r.timestamp.toISOString().slice(0, 10);
    dailyCost[day] = (dailyCost[day] || 0) + r.costCents;
  }

  return Response.json({
    config: {
      maxCostPerRunCents: agent.maxCostPerRunCents,
      monthlyCostCapCents: agent.monthlyCostCapCents,
      budgetExceededBehavior: agent.budgetExceededBehavior || "notify_continue",
    },
    usage: {
      monthlyCostCents: monthlyResult._sum.costCents || 0,
      monthlyCallCount: monthlyResult._count || 0,
      byModel,
      dailyCost: Object.entries(dailyCost)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, costCents]) => ({ date, costCents })),
    },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!agent) return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });

  const body = await request.json();

  const maxCostPerRunCents = body.maxCostPerRunCents === null || body.maxCostPerRunCents === undefined
    ? null
    : Math.max(0, Math.round(Number(body.maxCostPerRunCents)));

  const monthlyCostCapCents = body.monthlyCostCapCents === null || body.monthlyCostCapCents === undefined
    ? null
    : Math.max(0, Math.round(Number(body.monthlyCostCapCents)));

  const validBehaviors = ["pause", "downgrade", "notify_continue"];
  const budgetExceededBehavior = validBehaviors.includes(body.budgetExceededBehavior)
    ? body.budgetExceededBehavior
    : "notify_continue";

  await prisma.agent.update({
    where: { id: params.id },
    data: {
      maxCostPerRunCents,
      monthlyCostCapCents,
      budgetExceededBehavior,
    },
  });

  return Response.json({ ok: true });
}
