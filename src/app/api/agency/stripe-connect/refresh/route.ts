import { auth } from "@clerk/nextjs/server";
import { canConnectStripe, type PlanType } from "@/lib/stripe";
import { getConnectAccount, refreshAccountStatus } from "@/lib/stripe/connect";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency/stripe-connect/refresh
 *
 * Pulls the latest account snapshot from Stripe and writes the readiness
 * flags into the AgencyStripeAccount row. The billing UI's "Refresh
 * status" button calls this; the Connect webhook also writes through
 * persistAccountSnapshot for hands-off updates.
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

  const existing = await getConnectAccount(orgId);
  if (!existing) {
    return Response.json({ error: "Not connected" }, { status: 404 });
  }

  try {
    const updated = await refreshAccountStatus(existing.stripeAccountId);
    return Response.json({
      stripeAccountId: updated.stripeAccountId,
      onboardingComplete: updated.onboardingComplete,
      detailsSubmitted: updated.detailsSubmitted,
      payoutsEnabled: updated.payoutsEnabled,
      chargesEnabled: updated.chargesEnabled,
      lastSyncedAt: updated.lastSyncedAt?.toISOString() ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe refresh failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
