import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canManageSubOrgs } from "@/lib/agency/permissions";
import { canConnectStripe, type PlanType } from "@/lib/stripe";
import { getConnectAccount } from "@/lib/stripe/connect";
import {
  archiveSubOrgPrice,
  upsertSubOrgPrice,
} from "@/lib/stripe/connect-pricing";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/agency/sub-orgs/[id]/pricing
 * Returns the current pricing config for a sub-org. Sub-org members and
 * the parent agency's owner can both read; only the agency-side route
 * (/agency/...) is exposed here, so we just check canManageSubOrgs.
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
    select: {
      id: true,
      childOrgId: true,
      subOrgName: true,
      pricingMode: true,
      monthlyPriceCents: true,
      setupFeeCents: true,
      pricingCurrency: true,
      stripeProductId: true,
      stripePriceId: true,
    },
  });
  if (!relationship) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }

  return Response.json(relationship);
}

/**
 * POST /api/agency/sub-orgs/[id]/pricing
 *
 * Body: { mode: "NONE" | "FIXED" | "CUSTOM",
 *         monthlyPriceCents?, setupFeeCents?, currency? }
 *
 * For FIXED mode, creates (or replaces) the recurring price on the
 * agency's connected Stripe account and stores the IDs locally. NONE
 * and CUSTOM just write the pricing fields without touching Stripe.
 *
 * Switching FIXED → other modes archives the old price (best-effort).
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

  // FIXED requires Stripe Connect to be configured. BUSINESS-tier orgs
  // can have sub-orgs but cannot do FIXED billing — they have to use
  // CUSTOM (invoiced outside KILN) or NONE.
  if (mode === "FIXED") {
    if (!canConnectStripe((user?.plan ?? null) as PlanType | null)) {
      return Response.json(
        { error: "FIXED pricing requires Stripe Connect (Agency tier)." },
        { status: 403 }
      );
    }
    if (!body.monthlyPriceCents || body.monthlyPriceCents < 50) {
      return Response.json(
        { error: "monthlyPriceCents must be at least 50" },
        { status: 400 }
      );
    }
    const connect = await getConnectAccount(orgId);
    if (!connect?.onboardingComplete) {
      return Response.json(
        { error: "Connect onboarding not complete" },
        { status: 412 }
      );
    }

    let productId = relationship.stripeProductId ?? null;
    let priceId = relationship.stripePriceId ?? null;

    try {
      const priceCurrency = (body.currency ?? "eur").toLowerCase();
      const result = await upsertSubOrgPrice(connect.stripeAccountId, {
        productName: relationship.subOrgName,
        amount: body.monthlyPriceCents,
        currency: priceCurrency,
        existingProductId: productId,
        metadata: {
          kilnSubOrgId: relationship.childOrgId,
          kilnParentAgencyOrgId: orgId,
        },
      });
      // If a previous price existed, archive it so it can't be reused.
      if (priceId && priceId !== result.priceId) {
        await archiveSubOrgPrice(connect.stripeAccountId, priceId);
      }
      productId = result.productId;
      priceId = result.priceId;

      const updated = await prisma.orgRelationship.update({
        where: { id },
        data: {
          pricingMode: "FIXED",
          monthlyPriceCents: body.monthlyPriceCents,
          setupFeeCents: body.setupFeeCents ?? null,
          pricingCurrency: priceCurrency,
          stripeProductId: productId,
          stripePriceId: priceId,
        },
      });
      return Response.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe error";
      return Response.json({ error: message }, { status: 502 });
    }
  }

  // NONE / CUSTOM: archive the existing price so it can't be reused, but
  // keep productId so a future FIXED switch reuses the same product.
  if (relationship.stripePriceId) {
    const connect = await getConnectAccount(orgId);
    if (connect) {
      await archiveSubOrgPrice(connect.stripeAccountId, relationship.stripePriceId);
    }
  }

  const updated = await prisma.orgRelationship.update({
    where: { id },
    data: {
      pricingMode: mode,
      monthlyPriceCents: null,
      setupFeeCents: null,
      stripePriceId: null,
    },
  });
  return Response.json(updated);
}
