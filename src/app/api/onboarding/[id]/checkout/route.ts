import { prisma } from "@/lib/prisma";
import { getConnectAccount } from "@/lib/stripe/connect";
import { createBrandedCheckoutSession } from "@/lib/stripe/connect-pricing";
import { resolveSafeCheckoutUrl } from "@/lib/stripe/checkout-url";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/onboarding/[id]/checkout
 *
 * Public companion to /api/agency/sub-orgs/[id]/checkout. Used by the
 * white-labeled onboarding page (/onboarding/[id]) which is reached by
 * anonymous prospects via a link the agency shares — no Clerk auth yet.
 *
 * Security model:
 *   - The relationship id is a server-generated cuid (unguessable).
 *   - The endpoint only creates a Stripe Checkout session; no DB
 *     mutations. Stripe handles email collection + payment.
 *   - Subscription metadata routes the webhook back to the right
 *     sub-org row when payment succeeds.
 *   - Pricing must be FIXED + ready (Stripe Connect onboarded, monthly
 *     price ID set). Otherwise we 412 — the public link can't trigger
 *     checkout for misconfigured sub-orgs.
 *
 * The agency-side /api/agency/sub-orgs/[id]/checkout still exists for
 * the authenticated-customer flow (when a sub-org member kicks off
 * checkout from inside the dashboard).
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;

  const relationship = await prisma.orgRelationship.findUnique({
    where: { id },
    select: {
      id: true,
      childOrgId: true,
      parentOrgId: true,
      subOrgStatus: true,
      pricingMode: true,
      stripeMonthlyPriceId: true,
      stripeSetupPriceId: true,
      trialDays: true,
    },
  });
  if (!relationship || relationship.subOrgStatus !== "ACTIVE") {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }

  if (
    relationship.pricingMode !== "FIXED" ||
    !relationship.stripeMonthlyPriceId
  ) {
    return Response.json(
      { error: "Sub-org has no fixed-price subscription configured" },
      { status: 412 }
    );
  }

  const connect = await getConnectAccount(relationship.parentOrgId);
  if (!connect?.onboardingComplete) {
    return Response.json(
      { error: "Agency Stripe Connect not active" },
      { status: 412 }
    );
  }

  // Optional customer-supplied email + return URLs so the agency can
  // send the link back to its own custom-domain success page.
  let body: { email?: string; successUrl?: string; cancelUrl?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  // Open-Redirect-Schutz: client-gelieferte Return-URLs nur zulassen, wenn sie
  // auf die App oder eine verifizierte Custom-Domain dieser Agency zeigen.
  const successUrl = await resolveSafeCheckoutUrl(
    body.successUrl,
    relationship.parentOrgId,
    `${appUrl}/onboarding/${id}/success`,
  );
  const cancelUrl = await resolveSafeCheckoutUrl(
    body.cancelUrl,
    relationship.parentOrgId,
    `${appUrl}/onboarding/${id}`,
  );

  try {
    const session = await createBrandedCheckoutSession({
      agencyAccountId: connect.stripeAccountId,
      monthlyPriceId: relationship.stripeMonthlyPriceId,
      setupPriceId: relationship.stripeSetupPriceId,
      trialDays: relationship.trialDays,
      successUrl,
      cancelUrl,
      customerEmail: body.email,
      subOrgId: relationship.childOrgId,
      parentAgencyOrgId: relationship.parentOrgId,
    });
    return Response.json({ url: session.url, sessionId: session.sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
