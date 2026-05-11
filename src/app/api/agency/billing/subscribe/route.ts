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
 * POST /api/agency/billing/subscribe
 *
 * Body: { tier: 'starter' | 'professional' | 'agency_pro' | 'enterprise' }
 *
 * Behavior:
 *  - Requires an authenticated agency-owner with an active Clerk org.
 *  - Creates or reuses the AgencyPlatformSubscription row keyed by orgId.
 *  - Creates or reuses the Stripe Customer (org-scoped, separate from the
 *    legacy per-User stripeCustomerId on the User row).
 *  - Creates a Stripe Checkout session (mode=subscription) with the tier
 *    price as the single line item; persists customer + subscription
 *    relationship lazily via webhook (handled separately).
 *  - Returns { checkoutUrl } so the client can redirect.
 *
 * Returns a 409 when an active/trialing subscription already exists —
 * callers should use the change-tier endpoint instead.
 */
export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) {
    return Response.json(
      { error: "Active Clerk organization required (agency-org scope)" },
      { status: 400 },
    );
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
      { error: `Stripe price not configured for tier ${tier} — env var missing` },
      { status: 503 },
    );
  }

  const existing = await prisma.agencyPlatformSubscription.findUnique({ where: { orgId } });
  if (existing && existing.stripeSubscriptionId && (existing.status === "active" || existing.status === "trialing")) {
    return Response.json(
      {
        error: "Subscription already active for this org — use /api/agency/billing/change-tier",
        currentTier: existing.tier,
        currentStatus: existing.status,
      },
      { status: 409 },
    );
  }

  // Load the requester so we can stamp the Stripe Customer with email.
  const requester = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, companyName: true },
  });

  const { getStripe } = await import("@/lib/stripe");
  const stripe = getStripe();

  // Re-use the row's customer if present (incomplete/past payment retry);
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

  // Persist the row early so the webhook handler that fills in
  // stripeSubscriptionId can match the org via stripeCustomerId.
  const row = await prisma.agencyPlatformSubscription.upsert({
    where: { orgId },
    create: {
      orgId,
      stripeCustomerId: customerId,
      tier,
      status: "incomplete",
      createdSource: "api",
    },
    update: {
      stripeCustomerId: customerId,
      tier,
      status: existing?.status === "canceled" ? "incomplete" : existing?.status ?? "incomplete",
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard/agency/billing?success=true&tier=${tier}`,
    cancel_url: `${appUrl}/dashboard/agency/billing?canceled=true`,
    metadata: {
      kiln_agency_org_id: orgId,
      kiln_owner_user_id: userId,
      kiln_tier: tier,
      kiln_platform_subscription_row_id: row.id,
    },
    subscription_data: {
      metadata: {
        kiln_agency_org_id: orgId,
        kiln_tier: tier,
      },
    },
  });

  await logAudit({
    orgId,
    actorUserId: userId,
    actorOrgId: orgId,
    action: "AGENCY_SUBSCRIPTION_CHECKOUT_STARTED",
    resourceType: "AGENCY_PLATFORM_SUBSCRIPTION",
    resourceId: row.id,
    description: `Checkout started for tier ${tier}`,
    severity: "INFO",
    metadata: { tier, sessionId: session.id, customerId },
  });

  return Response.json({ checkoutUrl: session.url, tier, sessionId: session.id });
}
