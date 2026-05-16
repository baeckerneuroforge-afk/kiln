/**
 * Sprint 20 — POST /api/billing/upgrade
 *
 * Single entry point for "I'm on Free (or no subscription) and want to
 * upgrade to a paid tier" AND "I'm already on a paid tier and want to
 * change to a different one". The body carries `{ targetTier }`, the
 * response carries either `{ checkoutUrl }` (Stripe Checkout redirect
 * for the first paid subscription) or `{ ok: true, tier }` (in-place
 * change of an existing subscription's price item).
 *
 * Routes through AgencyPlatformSubscription — the same row that
 * /api/agency/billing/{subscribe,change-tier} use. Free-Tier orgs by
 * definition have no row in that table (resolveTierForOrg falls back
 * to "free" when the row is missing or status != active/trialing), so
 * the first upgrade creates the row + a Stripe Customer + a Checkout
 * session in one go.
 *
 * Permission gate: requires an authenticated Clerk user with an
 * active org context. Anyone in the org can hit this endpoint — the
 * spec deliberately keeps the gate light so a founder + first
 * employee can both click "Upgrade" from the in-app banner without
 * an extra org-role check. Stripe's customer portal then handles
 * payment-method input.
 */

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
 * Body: { targetTier: "starter" | "professional" | "agency_pro" | "enterprise" }
 *
 * Note: "free" is NOT a valid target here. Downgrading a paid
 * subscription to free is handled by the customer-portal cancel flow
 * (the Stripe webhook then degrades resolveTierForOrg back to "free"
 * automatically when status transitions to canceled).
 */
export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) {
    return Response.json(
      { error: "Active Clerk organization required" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  if (!isAgencyTier(body.targetTier)) {
    return Response.json(
      {
        error:
          "targetTier must be one of: starter | professional | agency_pro | enterprise",
      },
      { status: 400 },
    );
  }
  const targetTier: AgencyTier = body.targetTier;
  const priceId = getStripePriceIdForTier(targetTier);
  if (!priceId) {
    return Response.json(
      { error: `Stripe price not configured for tier ${targetTier}` },
      { status: 503 },
    );
  }

  const existing = await prisma.agencyPlatformSubscription.findUnique({
    where: { orgId },
  });

  // Path A: change tier in place on an existing healthy subscription.
  if (
    existing &&
    existing.stripeSubscriptionId &&
    (existing.status === "active" || existing.status === "trialing")
  ) {
    if (existing.tier === targetTier) {
      return Response.json({ ok: true, unchanged: true, tier: targetTier });
    }
    if (!existing.tierSubscriptionItemId) {
      return Response.json(
        { error: "Tier subscription item id is missing — reconcile first" },
        { status: 409 },
      );
    }

    const { getStripe } = await import("@/lib/stripe");
    const stripe = getStripe();
    await stripe.subscriptionItems.update(existing.tierSubscriptionItemId, {
      price: priceId,
      proration_behavior: "create_prorations",
    });

    const updated = await prisma.agencyPlatformSubscription.update({
      where: { orgId },
      data: { tier: targetTier },
    });

    await logAudit({
      orgId,
      actorUserId: userId,
      actorOrgId: orgId,
      action: "TIER_UPGRADED",
      resourceType: "AGENCY_PLATFORM_SUBSCRIPTION",
      resourceId: existing.id,
      description: `Tier upgraded ${existing.tier} → ${targetTier}`,
      severity: "INFO",
      metadata: {
        previousTier: existing.tier,
        targetTier,
        path: "change-tier",
        subscriptionId: existing.stripeSubscriptionId,
      },
    });

    return Response.json({
      ok: true,
      tier: updated.tier,
      status: updated.status,
      path: "change-tier",
    });
  }

  // Path B: fresh checkout — free → paid, or restart after cancel.
  const requester = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, companyName: true },
  });

  const { getStripe } = await import("@/lib/stripe");
  const stripe = getStripe();

  // Reuse the row's customer if present (incomplete/canceled retry),
  // otherwise create a fresh org-scoped customer.
  let customerId = existing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: requester?.email,
      name: requester?.companyName ?? undefined,
      metadata: {
        kiln_agency_org_id: orgId,
        kiln_owner_user_id: userId,
      },
    });
    customerId = customer.id;
  }

  const row = await prisma.agencyPlatformSubscription.upsert({
    where: { orgId },
    create: {
      orgId,
      stripeCustomerId: customerId,
      tier: targetTier,
      status: "incomplete",
      createdSource: "api",
    },
    update: {
      stripeCustomerId: customerId,
      tier: targetTier,
      // If the previous row was canceled, reset to incomplete so the
      // webhook can fill in a fresh subscription id when the customer
      // completes payment.
      status: existing?.status === "canceled" ? "incomplete" : existing?.status ?? "incomplete",
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard/settings/billing?upgraded=true&tier=${targetTier}`,
    cancel_url: `${appUrl}/dashboard/settings/billing?canceled=true`,
    metadata: {
      kiln_agency_org_id: orgId,
      kiln_owner_user_id: userId,
      kiln_tier: targetTier,
      kiln_platform_subscription_row_id: row.id,
      kiln_upgrade_source: "free_tier",
    },
    subscription_data: {
      metadata: {
        kiln_agency_org_id: orgId,
        kiln_tier: targetTier,
      },
    },
  });

  await logAudit({
    orgId,
    actorUserId: userId,
    actorOrgId: orgId,
    action: "TIER_UPGRADE_CHECKOUT_STARTED",
    resourceType: "AGENCY_PLATFORM_SUBSCRIPTION",
    resourceId: row.id,
    description: `Upgrade checkout started for tier ${targetTier}`,
    severity: "INFO",
    metadata: {
      previousTier: existing?.tier ?? null,
      targetTier,
      sessionId: session.id,
      customerId,
      path: "checkout",
    },
  });

  return Response.json({
    checkoutUrl: session.url,
    tier: targetTier,
    sessionId: session.id,
    path: "checkout",
  });
}
