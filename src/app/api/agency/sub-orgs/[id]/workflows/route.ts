/**
 * GET /api/agency/sub-orgs/[id]/workflows — AgentTeams (workflows)
 * owned by the sub-org. Workflow runs come from TeamExecution; we
 * aggregate the last 30 days for success-rate / avg-duration / last-run.
 *
 * Auth: see @/lib/agency/sub-org-auth.
 */
import { prisma } from "@/lib/prisma";
import { requireSubOrgAccess } from "@/lib/agency/sub-org-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await requireSubOrgAccess(params.id);
  if (!access.ok) return access.response;
  const orgId = access.relationship.childOrgId;

  const workflows = await prisma.agentTeam.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  if (workflows.length === 0) {
    return Response.json({ items: [] });
  }

  // Pull execution stats per team in one batch query.
  const teamIds = workflows.map((w) => w.id);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const executions = await prisma.teamExecution.findMany({
    where: { teamId: { in: teamIds }, startedAt: { gte: since } },
    select: {
      teamId: true,
      status: true,
      startedAt: true,
      completedAt: true,
    },
  });

  const byTeam = new Map<string, {
    count: number;
    success: number;
    durationSumMs: number;
    durationCount: number;
    lastRunAt: Date | null;
  }>();
  for (const e of executions) {
    const cur = byTeam.get(e.teamId) ?? {
      count: 0,
      success: 0,
      durationSumMs: 0,
      durationCount: 0,
      lastRunAt: null,
    };
    cur.count += 1;
    if (e.status === "COMPLETED") cur.success += 1;
    if (e.completedAt) {
      const ms = e.completedAt.getTime() - e.startedAt.getTime();
      if (ms > 0) {
        cur.durationSumMs += ms;
        cur.durationCount += 1;
      }
    }
    if (!cur.lastRunAt || e.startedAt > cur.lastRunAt) cur.lastRunAt = e.startedAt;
    byTeam.set(e.teamId, cur);
  }

  return Response.json({
    items: workflows.map((w) => {
      const stats = byTeam.get(w.id);
      const successRate =
        stats && stats.count > 0
          ? Math.round((stats.success / stats.count) * 100)
          : null;
      const avgDurationMs =
        stats && stats.durationCount > 0
          ? Math.round(stats.durationSumMs / stats.durationCount)
          : null;
      return {
        id: w.id,
        name: w.name,
        status: w.status,
        runs30d: stats?.count ?? 0,
        successRate,
        avgDurationMs,
        lastRunAt: stats?.lastRunAt?.toISOString() ?? null,
        updatedAt: w.updatedAt.toISOString(),
      };
    }),
  });
}
