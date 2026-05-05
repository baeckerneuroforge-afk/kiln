import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canViewRevenueDashboard, type PlanType } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * GET /api/agency/revenue
 *
 * Aggregates the agency's revenue numbers from the locally cached
 * SubOrgSubscription + SubOrgInvoice rows. No Stripe round-trip.
 *
 * Auth: AGENCY / ENTERPRISE / ADMIN tier. The endpoint reads its own
 * canViewRevenueDashboard flag rather than re-checking Stripe Connect
 * status — even an agency that's mid-onboarding should be able to see
 * the empty dashboard, just not the green numbers.
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return Response.json({ error: "No active organization" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!canViewRevenueDashboard((user?.plan ?? null) as PlanType | null)) {
    return Response.json(
      { error: "Revenue dashboard requires Agency tier." },
      { status: 403 }
    );
  }

  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);

  const [subscriptions, invoices30, invoices90, canceled30, subOrgs] =
    await Promise.all([
      prisma.subOrgSubscription.findMany({
        where: { parentAgencyOrgId: orgId },
        select: {
          id: true,
          subOrgId: true,
          status: true,
          priceAmount: true,
          priceCurrency: true,
          priceInterval: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      }),
      prisma.subOrgInvoice.findMany({
        where: {
          parentAgencyOrgId: orgId,
          status: "paid",
          paidAt: { gte: thirtyDaysAgo },
        },
        select: { amount: true },
      }),
      prisma.subOrgInvoice.findMany({
        where: {
          parentAgencyOrgId: orgId,
          status: "paid",
          paidAt: { gte: ninetyDaysAgo },
        },
        select: { amount: true },
      }),
      prisma.subOrgSubscription.count({
        where: {
          parentAgencyOrgId: orgId,
          status: "CANCELED",
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.orgRelationship.findMany({
        where: { parentOrgId: orgId, subOrgStatus: "ACTIVE" },
        select: { childOrgId: true, subOrgName: true },
      }),
    ]);

  const subOrgNameByChildId = new Map<string, string>();
  for (const s of subOrgs) subOrgNameByChildId.set(s.childOrgId, s.subOrgName);

  // MRR: sum monthly equivalent of every ACTIVE / TRIALING subscription.
  // Yearly intervals contribute 1/12 of the price per month so the
  // aggregate is comparable across mixed billing cadences.
  let mrr = 0;
  let activeSubscriptions = 0;
  let trialSubscriptions = 0;
  let pastDueSubscriptions = 0;

  for (const sub of subscriptions) {
    if (sub.status === "ACTIVE") activeSubscriptions += 1;
    if (sub.status === "TRIALING") trialSubscriptions += 1;
    if (sub.status === "PAST_DUE") pastDueSubscriptions += 1;
    if (sub.status === "ACTIVE" || sub.status === "TRIALING") {
      const monthly =
        sub.priceInterval === "year"
          ? Math.round(sub.priceAmount / 12)
          : sub.priceAmount;
      mrr += monthly;
    }
  }

  const revenue30d = invoices30.reduce((acc, inv) => acc + inv.amount, 0);
  const revenue90d = invoices90.reduce((acc, inv) => acc + inv.amount, 0);

  return Response.json({
    mrr,
    activeSubscriptions,
    trialSubscriptions,
    pastDueSubscriptions,
    canceledLast30d: canceled30,
    revenue30d,
    revenue90d,
    currency: subscriptions[0]?.priceCurrency ?? "eur",
    subOrgs: subscriptions.map((sub) => ({
      subOrgId: sub.subOrgId,
      name: subOrgNameByChildId.get(sub.subOrgId) ?? "Unnamed",
      status: sub.status,
      mrrContribution:
        sub.status === "ACTIVE" || sub.status === "TRIALING"
          ? sub.priceInterval === "year"
            ? Math.round(sub.priceAmount / 12)
            : sub.priceAmount
          : 0,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    })),
  });
}
