import { auth } from "@clerk/nextjs/server";
import { getAgencyPlatformSubscription, TIER_MONTHLY_EUR } from "@/lib/billing/agency-tier";

export const dynamic = "force-dynamic";

/**
 * GET /api/agency/billing
 * Returns the agency's current platform subscription + tier pricing
 * table so the billing dashboard can render without round-tripping
 * Stripe on every load.
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return Response.json({ error: "No active organization" }, { status: 400 });

  const row = await getAgencyPlatformSubscription(orgId);
  return Response.json({
    subscription: row,
    pricing: TIER_MONTHLY_EUR,
  });
}
