import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getConnectAccount } from "@/lib/stripe/connect";
import { createBrandedCheckoutSession } from "@/lib/stripe/connect-pricing";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/agency/sub-orgs/[id]/checkout
 *
 * Body: { successUrl, cancelUrl }
 *
 * Creates a Stripe Checkout session on the agency's connected account
 * for the sub-org's configured FIXED price. Returns the hosted URL the
 * client redirects to.
 *
 * Auth: caller must be a member of the SUB-ORG (the active org context
 * needs to match the sub-org's childOrgId), since this is the
 * customer-side flow — the sub-org owner activates their own
 * subscription. Agency-tier owners trigger this from the sub-org's
 * activation banner inside their client portal context.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return Response.json({ error: "No active organization" }, { status: 400 });
  }

  // Look up relationship by id (which is the OrgRelationship.id, not a
  // Clerk org id) and confirm the active org matches the sub-org child.
  const relationship = await prisma.orgRelationship.findUnique({
    where: { id },
  });
  if (!relationship) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  if (relationship.childOrgId !== orgId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (relationship.pricingMode !== "FIXED" || !relationship.stripeMonthlyPriceId) {
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

  let body: { successUrl?: string; cancelUrl?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const successUrl =
    body.successUrl || `${appUrl}/dashboard?subscription=success`;
  const cancelUrl =
    body.cancelUrl || `${appUrl}/dashboard?subscription=canceled`;

  const email = await getUserEmailOrPlaceholder(userId);

  try {
    // Branded session = monthly + setup line items + trial. The
    // agency-side flow always wires the full set; if setup or trial are
    // unset on the relationship, the helper just skips them.
    const session = await createBrandedCheckoutSession({
      agencyAccountId: connect.stripeAccountId,
      monthlyPriceId: relationship.stripeMonthlyPriceId,
      setupPriceId: relationship.stripeSetupPriceId,
      trialDays: relationship.trialDays,
      successUrl,
      cancelUrl,
      customerEmail: email,
      subOrgId: relationship.childOrgId,
      parentAgencyOrgId: relationship.parentOrgId,
    });
    return Response.json({ url: session.url, sessionId: session.sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
