import { auth } from "@clerk/nextjs/server";
import { canConnectStripe, type PlanType } from "@/lib/stripe";
import { getConnectAccount } from "@/lib/stripe/connect";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/agency/stripe-connect/status
 *
 * Returns the cached Connect account snapshot (or null when the org has
 * not started onboarding). Used by the billing settings page to render
 * the status card without a Stripe round-trip on every page load — a
 * separate POST /refresh endpoint pulls fresh data when the operator asks.
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
  if (!canConnectStripe((user?.plan ?? null) as PlanType | null)) {
    return Response.json(
      { error: "Stripe Connect is not available on your plan." },
      { status: 403 }
    );
  }

  const account = await getConnectAccount(orgId);
  if (!account) {
    return Response.json({ connected: false });
  }

  return Response.json({
    connected: true,
    stripeAccountId: account.stripeAccountId,
    onboardingComplete: account.onboardingComplete,
    detailsSubmitted: account.detailsSubmitted,
    payoutsEnabled: account.payoutsEnabled,
    chargesEnabled: account.chargesEnabled,
    requirements: account.requirementsJson,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
  });
}
