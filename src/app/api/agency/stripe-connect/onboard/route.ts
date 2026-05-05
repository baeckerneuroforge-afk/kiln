import { auth } from "@clerk/nextjs/server";
import { canConnectStripe, type PlanType } from "@/lib/stripe";
import {
  createConnectAccount,
  createOnboardingLink,
  getConnectAccount,
} from "@/lib/stripe/connect";
import { prisma } from "@/lib/prisma";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency/stripe-connect/onboard
 *
 * Kicks off (or resumes) Stripe Connect Express onboarding for the active
 * agency org. Creates the Connect account on first call, then returns a
 * fresh Stripe-hosted onboarding URL the client redirects to.
 *
 * Plan-gated: only AGENCY / ENTERPRISE / ADMIN can call this. BUSINESS gets
 * sub-orgs but is explicitly NOT allowed Connect (see canConnectStripe).
 */
export async function POST() {
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
  if (!canConnectStripe((user?.plan ?? null) as PlanType | null)) {
    return Response.json(
      { error: "Stripe Connect is not available on your plan." },
      { status: 403 }
    );
  }

  const email = await getUserEmailOrPlaceholder(userId);

  // Idempotent: if the org already has a Connect account, reuse it.
  const existing = await getConnectAccount(orgId);
  const account = existing ?? (await createConnectAccount(orgId, email));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = await createOnboardingLink(
    account.stripeAccountId,
    `${appUrl}/dashboard/agency/billing?onboarded=1`,
    `${appUrl}/dashboard/agency/billing?refresh=1`
  );

  return Response.json({
    url: link.url,
    stripeAccountId: account.stripeAccountId,
  });
}
