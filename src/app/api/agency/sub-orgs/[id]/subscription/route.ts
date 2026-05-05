import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canManageSubOrgs } from "@/lib/agency/permissions";
import { getConnectAccount } from "@/lib/stripe/connect";
import { cancelSubscriptionAtPeriodEnd } from "@/lib/stripe/connect-pricing";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/agency/sub-orgs/[id]/subscription
 *
 * Returns the active SubOrgSubscription row (if any) for a sub-org.
 * Either the agency-side owner or a member of the sub-org itself can
 * read; we resolve the relationship and accept either the parent or
 * child org as the active context.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const relationship = await prisma.orgRelationship.findUnique({ where: { id } });
  if (!relationship) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }

  // Authorize: caller's active org is either the parent agency (manager
  // can see everything) or the child sub-org itself (member can see
  // their own subscription).
  if (relationship.parentOrgId !== orgId && relationship.childOrgId !== orgId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (relationship.parentOrgId === orgId) {
    const allowed = await canManageSubOrgs(userId, orgId);
    if (!allowed) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const subscription = await prisma.subOrgSubscription.findUnique({
    where: { subOrgId: relationship.childOrgId },
  });

  return Response.json({
    subscription: subscription ?? null,
    pricingMode: relationship.pricingMode,
    monthlyPriceCents: relationship.monthlyPriceCents,
    pricingCurrency: relationship.pricingCurrency,
  });
}

/**
 * DELETE /api/agency/sub-orgs/[id]/subscription
 *
 * Cancels the current subscription at period end. The webhook will
 * mirror the canceled state into our DB row when Stripe finalizes.
 *
 * Auth: agency owner only (this is a destructive billing action; the
 * sub-org member uses the standard Stripe customer portal for
 * self-service if the agency enables it).
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const relationship = await prisma.orgRelationship.findUnique({ where: { id } });
  if (!relationship) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  if (relationship.parentOrgId !== orgId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const allowed = await canManageSubOrgs(userId, orgId);
  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const subscription = await prisma.subOrgSubscription.findUnique({
    where: { subOrgId: relationship.childOrgId },
  });
  if (!subscription) {
    return Response.json({ canceled: false, reason: "no_subscription" });
  }

  const connect = await getConnectAccount(relationship.parentOrgId);
  if (!connect) {
    return Response.json({ error: "Connect account missing" }, { status: 412 });
  }

  try {
    await cancelSubscriptionAtPeriodEnd(
      connect.stripeAccountId,
      subscription.stripeSubscriptionId
    );
    // Optimistically reflect locally so the dashboard updates without
    // waiting for the webhook round-trip.
    await prisma.subOrgSubscription.update({
      where: { subOrgId: relationship.childOrgId },
      data: { cancelAtPeriodEnd: true },
    });
    return Response.json({ canceled: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cancel failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
