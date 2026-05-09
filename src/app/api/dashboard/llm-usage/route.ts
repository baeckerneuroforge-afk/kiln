import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    const [rows, byDepartment, byWorker] = await Promise.all([
      prisma.llmUsage.findMany({
        where: { orgId, createdAt: { gte: since } },
        select: {
          createdAt: true,
          costUsd: true,
          costSavedUsd: true,
          cacheHit: true,
          byokActive: true,
          provider: true,
          modelId: true,
        },
      }),
      prisma.llmUsage.groupBy({
        by: ["departmentId"],
        where: { orgId, createdAt: { gte: since }, departmentId: { not: null } },
        _sum: { costUsd: true, costSavedUsd: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: "desc" } },
        take: 5,
      }),
      prisma.llmUsage.groupBy({
        by: ["workerId"],
        where: { orgId, createdAt: { gte: since }, workerId: { not: null } },
        _sum: { costUsd: true, costSavedUsd: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: "desc" } },
        take: 5,
      }),
    ]);

    const departmentIds = byDepartment.map((item) => item.departmentId).filter((id): id is string => Boolean(id));
    const workerIds = byWorker.map((item) => item.workerId).filter((id): id is string => Boolean(id));
    const [departments, workers] = await Promise.all([
      departmentIds.length
        ? prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      workerIds.length
        ? prisma.departmentWorker.findMany({ where: { id: { in: workerIds } }, select: { id: true, role: true } })
        : Promise.resolve([]),
    ]);
    const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
    const workerNames = new Map(workers.map((worker) => [worker.id, worker.role]));

    const daily = new Map<string, { date: string; costUsd: number; savedUsd: number }>();
    let totalCostUsd = 0;
    let totalSavedUsd = 0;
    let cacheHits = 0;
    let byokCalls = 0;
    const providerCounts = new Map<string, number>();
    for (const row of rows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const current = daily.get(date) ?? { date, costUsd: 0, savedUsd: 0 };
      const cost = Number(row.costUsd);
      const saved = Number(row.costSavedUsd);
      current.costUsd += cost;
      current.savedUsd += saved;
      daily.set(date, current);
      totalCostUsd += cost;
      totalSavedUsd += saved;
      if (row.cacheHit) cacheHits += 1;
      if (row.byokActive) byokCalls += 1;
      providerCounts.set(row.provider, (providerCounts.get(row.provider) ?? 0) + 1);
    }

    return Response.json({
      summary: {
        totalCostUsd: roundMoney(totalCostUsd),
        totalSavedUsd: roundMoney(totalSavedUsd),
        totalNaiveCostUsd: roundMoney(totalCostUsd + totalSavedUsd),
        savingsPercent: totalCostUsd + totalSavedUsd > 0
          ? Math.round((totalSavedUsd / (totalCostUsd + totalSavedUsd)) * 100)
          : 0,
        totalCalls: rows.length,
        cacheHitRate: rows.length > 0 ? Math.round((cacheHits / rows.length) * 100) : 0,
        byokCalls,
        poolCalls: rows.length - byokCalls,
      },
      daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)).map((item) => ({
        ...item,
        costUsd: roundMoney(item.costUsd),
        savedUsd: roundMoney(item.savedUsd),
      })),
      topDepartments: byDepartment.map((item) => ({
        id: item.departmentId,
        name: item.departmentId ? departmentNames.get(item.departmentId) ?? "Department" : "Department",
        calls: item._count._all,
        costUsd: roundMoney(Number(item._sum.costUsd ?? 0)),
        savedUsd: roundMoney(Number(item._sum.costSavedUsd ?? 0)),
      })),
      topWorkers: byWorker.map((item) => ({
        id: item.workerId,
        name: item.workerId ? workerNames.get(item.workerId) ?? "Worker" : "Worker",
        calls: item._count._all,
        costUsd: roundMoney(Number(item._sum.costUsd ?? 0)),
        savedUsd: roundMoney(Number(item._sum.costSavedUsd ?? 0)),
      })),
      providers: Array.from(providerCounts.entries()).map(([provider, calls]) => ({ provider, calls })),
    });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to load LLM usage" }, { status: 500 });
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
