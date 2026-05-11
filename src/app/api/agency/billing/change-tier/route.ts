import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";
import {
  getStripePriceIdForTier,
  isAgencyTier,
  type AgencyTier,
} from "@/lib/billing/agency-tier";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency/billing/change-tier
 *
 * Body: { tier: AgencyTier }
 *
 * Swaps the tier line item on an existing AgencyPlatformSubscription in
 * place. The customer's payment method is reused, no Checkout redirect.
 * Stripe will prorate the difference on the next invoice.
 *
 * Returns 404 when the agency has no subscription yet (caller should
 * use /subscribe instead), 409 when the subscription status is not
 * active/trialing.
 */
export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) {
    return Response.json({ error: "Active Clerk organization required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  if (!isAgencyTier(body.tier)) {
    return Response.json(
      { error: "tier must be one of: starter | professional | agency_pro | enterprise" },
      { status: 400 },
    );
  }
  const tier: AgencyTier = body.tier;
  const priceId = getStripePriceIdForTier(tier);
  if (!priceId) {
    return Response.json(
      { error: `Stripe price not configured for tier ${tier}` },
      { status: 503 },
    );
  }

  const row = await prisma.agencyPlatformSubscription.findUnique({ where: { orgId } });
  if (!row || !row.stripeSubscriptionId) {
    return Response.json(
      { error: "No active subscription — use /api/agency/billing/subscribe to create one" },
      { status: 404 },
    );
  }
  if (row.status !== "active" && row.status !== "trialing") {
    return Response.json(
      { error: `Subscription status ${row.status} does not allow tier change`, status: row.status },
      { status: 409 },
    );
  }
  if (row.tier === tier) {
    return Response.json({ ok: true, unchanged: true, tier });
  }

  const { getStripe } = await import("@/lib/stripe");
  const stripe = getStripe();
  if (!row.tierSubscriptionItemId) {
    return Response.json(
      { error: "Tier subscription item id is missing — reconcile first" },
      { status: 409 },
    );
  }

  await stripe.subscriptionItems.update(row.tierSubscriptionItemId, {
    price: priceId,
    proration_behavior: "create_prorations",
  });

  const updated = await prisma.agencyPlatformSubscription.update({
    where: { orgId },
    data: { tier },
  });

  await logAudit({
    orgId,
    actorUserId: userId,
    actorOrgId: orgId,
    action: "AGENCY_SUBSCRIPTION_TIER_CHANGED",
    resourceType: "AGENCY_PLATFORM_SUBSCRIPTION",
    resourceId: row.id,
    description: `Tier changed ${row.tier} → ${tier}`,
    severity: "INFO",
    metadata: { previousTier: row.tier, tier, subscriptionId: row.stripeSubscriptionId },
  });

  return Response.json({ ok: true, tier: updated.tier, status: updated.status });
}
