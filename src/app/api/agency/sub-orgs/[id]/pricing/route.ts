import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canManageSubOrgs } from "@/lib/agency/permissions";
import { canConnectStripe, type PlanType } from "@/lib/stripe";
import { getConnectAccount } from "@/lib/stripe/connect";
import {
  archiveSubOrgPrice,
  createSubOrgPricing,
} from "@/lib/stripe/connect-pricing";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const PRICING_SELECT = {
  id: true,
  childOrgId: true,
  subOrgName: true,
  pricingMode: true,
  monthlyPriceCents: true,
  setupFeeCents: true,
  trialDays: true,
  pricingCurrency: true,
  stripeProductId: true,
  stripeMonthlyPriceId: true,
  stripeSetupPriceId: true,
} as const;

/**
 * GET /api/agency/sub-orgs/[id]/pricing
 * Returns the current pricing config for a sub-org. Auth: agency owner.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canManageSubOrgs(userId, orgId);
  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const relationship = await prisma.orgRelationship.findFirst({
    where: { id, parentOrgId: orgId },
    select: PRICING_SELECT,
  });
  if (!relationship) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }

  return Response.json(relationship);
}

/**
 * POST /api/agency/sub-orgs/[id]/pricing
 *
 * Body: {
 *   mode: "NONE" | "FIXED" | "CUSTOM",
 *   monthlyPriceCents?: number,
 *   setupFeeCents?: number,
 *   trialDays?: number,
 *   currency?: string
 * }
 *
 * Per-mode behavior:
 *   - NONE:   clears all pricing fields. Archives any existing Stripe
 *             price. Sub-org is free.
 *   - FIXED:  persists pricing locally. If the agency has finished
 *             Stripe Connect onboarding, also creates the Product +
 *             monthly + setup prices on the connected account and
 *             stores their IDs. If onboarding is incomplete the local
 *             pricing is still saved (so the agency can configure
 *             pricing before Stripe is ready); the API responds with
 *             stripePending=true and the Stripe-side resources can be
 *             provisioned later by re-POSTing the same payload.
 *   - CUSTOM: persists pricing locally as display-only numbers; never
 *             touches Stripe. The agency invoices the client outside
 *             KILN.
 *
 * BUSINESS-tier agencies can only use NONE or CUSTOM (canConnectStripe
 * is false). FIXED requires AGENCY+ tier.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  const allowed = await canManageSubOrgs(userId, orgId);
  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    mode?: string;
    monthlyPriceCents?: number;
    setupFeeCents?: number;
    trialDays?: number;
    currency?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode = body.mode;
  if (mode !== "NONE" && mode !== "FIXED" && mode !== "CUSTOM") {
    return Response.json({ error: "Invalid mode" }, { status: 400 });
  }

  const relationship = await prisma.orgRelationship.findFirst({
    where: { id, parentOrgId: orgId },
  });
  if (!relationship) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }

  // ── Mode: NONE ────────────────────────────────────────────────────
  // Clear pricing, archive any existing Stripe price (best-effort).
  if (mode === "NONE") {
    if (relationship.stripeMonthlyPriceId) {
      const connect = await getConnectAccount(orgId);
      if (connect) {
        await archiveSubOrgPrice(
          connect.stripeAccountId,
          relationship.stripeMonthlyPriceId
        );
        if (relationship.stripeSetupPriceId) {
          await archiveSubOrgPrice(
            connect.stripeAccountId,
            relationship.stripeSetupPriceId
          );
        }
      }
    }
    const updated = await prisma.orgRelationship.update({
      where: { id },
      data: {
        pricingMode: "NONE",
        monthlyPriceCents: null,
        setupFeeCents: null,
        trialDays: null,
        stripeMonthlyPriceId: null,
        stripeSetupPriceId: null,
      },
      select: PRICING_SELECT,
    });
    return Response.json(updated);
  }

  // ── Mode: CUSTOM ──────────────────────────────────────────────────
  // Display-only. Agency invoices the client outside of Stripe Connect
  // so we never call Stripe. BUSINESS tier is allowed (no Connect
  // requirement); price fields persist for the onboarding page to read.
  if (mode === "CUSTOM") {
    if (relationship.stripeMonthlyPriceId) {
      const connect = await getConnectAccount(orgId);
      if (connect) {
        await archiveSubOrgPrice(
          connect.stripeAccountId,
          relationship.stripeMonthlyPriceId
        );
        if (relationship.stripeSetupPriceId) {
          await archiveSubOrgPrice(
            connect.stripeAccountId,
            relationship.stripeSetupPriceId
          );
        }
      }
    }
    const priceCurrency = (body.currency ?? "eur").toLowerCase();
    const updated = await prisma.orgRelationship.update({
      where: { id },
      data: {
        pricingMode: "CUSTOM",
        monthlyPriceCents: body.monthlyPriceCents ?? null,
        setupFeeCents: body.setupFeeCents ?? null,
        trialDays: null,
        pricingCurrency: priceCurrency,
        stripeMonthlyPriceId: null,
        stripeSetupPriceId: null,
      },
      select: PRICING_SELECT,
    });
    return Response.json(updated);
  }

  // ── Mode: FIXED ───────────────────────────────────────────────────
  if (!canConnectStripe((user?.plan ?? null) as PlanType | null)) {
    return Response.json(
      { error: "FIXED pricing requires Stripe Connect (Agency tier)." },
      { status: 403 }
    );
  }
  // Either monthly or setup must be > 0 — pure-zero FIXED makes no sense.
  const hasMonthly = !!body.monthlyPriceCents && body.monthlyPriceCents > 0;
  const hasSetup = !!body.setupFeeCents && body.setupFeeCents > 0;
  if (!hasMonthly && !hasSetup) {
    return Response.json(
      { error: "FIXED requires at least monthlyPriceCents or setupFeeCents" },
      { status: 400 }
    );
  }
  if (hasMonthly && body.monthlyPriceCents! < 50) {
    return Response.json(
      { error: "monthlyPriceCents must be at least 50" },
      { status: 400 }
    );
  }
  if (hasSetup && body.setupFeeCents! < 50) {
    return Response.json(
      { error: "setupFeeCents must be at least 50" },
      { status: 400 }
    );
  }
  if (
    body.trialDays !== undefined &&
    (body.trialDays < 0 || body.trialDays > 730)
  ) {
    return Response.json(
      { error: "trialDays must be between 0 and 730" },
      { status: 400 }
    );
  }

  const priceCurrency = (body.currency ?? "eur").toLowerCase();
  const connect = await getConnectAccount(orgId);

  // Persist pricing locally regardless of Connect onboarding status —
  // the agency can configure ahead of completing Stripe onboarding, then
  // re-save once the connected account is ready to materialize the
  // Stripe-side resources.
  const dataLocal = {
    pricingMode: "FIXED" as const,
    monthlyPriceCents: hasMonthly ? body.monthlyPriceCents! : null,
    setupFeeCents: hasSetup ? body.setupFeeCents! : null,
    trialDays: body.trialDays ?? null,
    pricingCurrency: priceCurrency,
  };

  if (!connect?.onboardingComplete) {
    const updated = await prisma.orgRelationship.update({
      where: { id },
      data: {
        ...dataLocal,
        // Don't touch stripe IDs in pending state — keep existing if any,
        // they'll be replaced when onboarding completes and the route is
        // re-called.
      },
      select: PRICING_SELECT,
    });
    return Response.json({ ...updated, stripePending: true });
  }

  // Onboarding done — provision Product + prices on the connected account.
  try {
    const { productId, monthlyPriceId, setupPriceId } =
      await createSubOrgPricing({
        agencyAccountId: connect.stripeAccountId,
        subOrgId: relationship.childOrgId,
        subOrgName: relationship.subOrgName,
        setupFeeCents: hasSetup ? body.setupFeeCents! : 0,
        monthlyPriceCents: hasMonthly ? body.monthlyPriceCents! : 0,
        currency: priceCurrency,
        existingProductId: relationship.stripeProductId,
      });

    // Archive prior prices so they can't be re-attached. Best-effort —
    // failure here would block a pricing flip on a transient Stripe
    // outage, which is the wrong behavior.
    if (
      relationship.stripeMonthlyPriceId &&
      relationship.stripeMonthlyPriceId !== monthlyPriceId
    ) {
      await archiveSubOrgPrice(
        connect.stripeAccountId,
        relationship.stripeMonthlyPriceId
      );
    }
    if (
      relationship.stripeSetupPriceId &&
      relationship.stripeSetupPriceId !== setupPriceId
    ) {
      await archiveSubOrgPrice(
        connect.stripeAccountId,
        relationship.stripeSetupPriceId
      );
    }

    const updated = await prisma.orgRelationship.update({
      where: { id },
      data: {
        ...dataLocal,
        stripeProductId: productId,
        stripeMonthlyPriceId: monthlyPriceId,
        stripeSetupPriceId: setupPriceId,
      },
      select: PRICING_SELECT,
    });
    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return Response.json({ error: message }, { status: 502 });
  }
}
