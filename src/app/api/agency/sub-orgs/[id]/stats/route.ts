/**
 * GET /api/agency/sub-orgs/[id]/stats — KPI aggregates for the sub-org
 * detail Overview tab.
 *
 * Returned counts are scoped to the sub-org's Clerk Org ID and cover
 * the trailing 30 days for time-bounded metrics. The query batch runs
 * in parallel — 5 cheap groupBy / count queries — so this stays well
 * under 200ms for typical sub-orgs.
 *
 * MRR comes from the active SubOrgSubscription row (priceAmount in
 * cents). When no subscription exists or it's CANCELED, MRR is 0.
 *
 * Auth: same pattern as the rest of /api/agency/sub-orgs/[id]/* — see
 * @/lib/agency/sub-org-auth.
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

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    activeAgents,
    totalAgents,
    activeWorkflows,
    totalWorkflows,
    conversations30d,
    lastActivity,
    subscription,
  ] = await Promise.all([
    prisma.agent.count({
      where: { orgId, status: { in: ["LIVE", "DRAFT"] } },
    }),
    prisma.agent.count({ where: { orgId } }),
    prisma.agentTeam.count({ where: { orgId, status: "ACTIVE" } }),
    prisma.agentTeam.count({ where: { orgId } }),
    prisma.conversation.count({
      where: { orgId, createdAt: { gte: since } },
    }),
    prisma.auditEvent.findFirst({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.subOrgSubscription.findUnique({
      where: { subOrgId: orgId },
      select: {
        status: true,
        priceAmount: true,
        priceCurrency: true,
        priceInterval: true,
      },
    }),
  ]);

  const mrrCents =
    subscription &&
    (subscription.status === "ACTIVE" || subscription.status === "TRIALING")
      ? subscription.priceAmount
      : 0;

  return Response.json({
    activeAgents,
    totalAgents,
    activeWorkflows,
    totalWorkflows,
    conversations30d,
    lastActivityAt: lastActivity?.createdAt.toISOString() ?? null,
    mrrCents,
    mrrCurrency: subscription?.priceCurrency ?? "eur",
    subscriptionStatus: subscription?.status ?? null,
  });
}
