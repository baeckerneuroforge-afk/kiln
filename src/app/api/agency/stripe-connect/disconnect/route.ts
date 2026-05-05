import { auth } from "@clerk/nextjs/server";
import { canConnectStripe, type PlanType } from "@/lib/stripe";
import { disconnectAccount } from "@/lib/stripe/connect";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency/stripe-connect/disconnect
 *
 * Severs KILN's link to the agency's Stripe Connect account. The
 * underlying Stripe account, customers, and active subscriptions stay
 * intact in Stripe — the agency revokes there if they want to fully
 * unwind. KILN just stops referencing the account.
 *
 * After disconnect, sub-org subscriptions still exist in Stripe but the
 * dashboard can't manage them; the operator should cancel from Stripe or
 * reconnect via /onboard before changing pricing.
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

  const removed = await disconnectAccount(orgId);
  if (!removed) {
    return Response.json({ disconnected: false });
  }

  return Response.json({
    disconnected: true,
    stripeAccountId: removed.stripeAccountId,
  });
}
