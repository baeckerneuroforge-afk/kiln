import { prisma } from "@/lib/prisma";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";

// Dashboard-home stats. Returns three logical groups in one round-trip:
//
//   - Agent activity:  agents (count), conversations (30d), leads (30d),
//                      estimatedValue (lifetime).
//   - Agency metrics:  mrr (sum of active sub-org sub price), activeSubOrgs,
//                      newSubOrgs30d. Always returned so the response shape
//                      is stable across plan tiers — values are zero for
//                      non-agency callers.
//   - Connect status:  stripeConnectStatus = 'not_onboarded' | 'pending' |
//                      'active'. Drives the dashboard's empty-state copy on
//                      the MRR tile.
//
// Org-scoping resolves agents first (mirrors GET /api/agents) and then
// counts conversations / aggregates analytics by `agentId IN (...)` rather
// than going through a Prisma to-one relation filter, which historically
// dropped legacy rows. Same pattern applies to sub-orgs: we count by
// parentOrgId on OrgRelationship + SubOrgSubscription directly.
export async function GET() {
  let scope;
  try {
    scope = await requireOrgId();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Agent IDs in scope (with legacy fallback). Drives the conversation
    // counts, lead count, and the agentAnalytics aggregate.
    const agents = await prisma.agent.findMany({
      where: orgScopeFilter(scope),
      select: { id: true },
    });
    const agentIds = agents.map((a) => a.id);

    // All four agent metrics in parallel + the agency metrics keyed
    // on the active orgId (no fallback — agency rows are always orgId-bound).
    const [
      conversations,
      leads,
      analytics,
      subscriptionsAggregate,
      activeSubOrgs,
      newSubOrgs30d,
      connectAccount,
      setupFees30dAgg,
    ] = await Promise.all([
      agentIds.length === 0
        ? Promise.resolve(0)
        : prisma.conversation.count({
            where: {
              agentId: { in: agentIds },
              createdAt: { gte: startOfMonth },
            },
          }),
      agentIds.length === 0
        ? Promise.resolve(0)
        : prisma.conversation.count({
            where: {
              agentId: { in: agentIds },
              createdAt: { gte: startOfMonth },
              visitorEmail: { not: null },
            },
          }),
      agentIds.length === 0
        ? Promise.resolve({ _sum: { estimatedValue: 0 } })
        : prisma.agentAnalytics.aggregate({
            where: { agentId: { in: agentIds } },
            _sum: { estimatedValue: true },
          }),
      // MRR: sum priceAmount across ACTIVE + TRIALING subs in this org.
      // Yearly subs would skew the figure if we counted raw priceAmount, so
      // we resolve them client-side after fetching the rows.
      prisma.subOrgSubscription.findMany({
        where: {
          parentAgencyOrgId: scope.orgId,
          status: { in: ["ACTIVE", "TRIALING"] },
        },
        select: { priceAmount: true, priceInterval: true },
      }),
      prisma.orgRelationship.count({
        where: { parentOrgId: scope.orgId, subOrgStatus: "ACTIVE" },
      }),
      prisma.orgRelationship.count({
        where: {
          parentOrgId: scope.orgId,
          subOrgStatus: "ACTIVE",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.agencyStripeAccount.findUnique({
        where: { orgId: scope.orgId },
        select: { onboardingComplete: true },
      }),
      // Phase 4: setup-fee revenue, last 30 days. Only paid invoices,
      // only setup-fee type. Agency-tier dashboards surface this
      // alongside MRR.
      prisma.subOrgInvoice.aggregate({
        where: {
          parentAgencyOrgId: scope.orgId,
          invoiceType: "SETUP_FEE",
          status: "paid",
          paidAt: { gte: thirtyDaysAgo },
        },
        _sum: { amount: true },
      }),
    ]);

    // Pending onboardings: sub-orgs with FIXED pricing configured but
    // no active subscription yet. Computed sequentially after the
    // parallel batch since it needs a second query for the
    // active-subscription set, and the count depends on its result.
    const subOrgIdsWithSub = await prisma.subOrgSubscription.findMany({
      where: {
        parentAgencyOrgId: scope.orgId,
        status: { in: ["ACTIVE", "TRIALING"] },
      },
      select: { subOrgId: true },
    });
    const pendingOnboardings = await prisma.orgRelationship.count({
      where: {
        parentOrgId: scope.orgId,
        subOrgStatus: "ACTIVE",
        pricingMode: "FIXED",
        NOT: {
          childOrgId: { in: subOrgIdsWithSub.map((s) => s.subOrgId) },
        },
      },
    });

    let mrr = 0;
    for (const sub of subscriptionsAggregate) {
      mrr +=
        sub.priceInterval === "year"
          ? Math.round(sub.priceAmount / 12)
          : sub.priceAmount;
    }

    const stripeConnectStatus: "not_onboarded" | "pending" | "active" =
      !connectAccount
        ? "not_onboarded"
        : connectAccount.onboardingComplete
        ? "active"
        : "pending";

    return Response.json({
      agents: agentIds.length,
      conversations,
      leads,
      estimatedValue: analytics._sum.estimatedValue ?? 0,
      mrr,
      activeSubscriptions: subscriptionsAggregate.length,
      activeSubOrgs,
      newSubOrgs30d,
      stripeConnectStatus,
      setupFees30d: setupFees30dAgg._sum.amount ?? 0,
      pendingOnboardings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
