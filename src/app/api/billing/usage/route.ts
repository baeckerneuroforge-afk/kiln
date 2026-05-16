/**
 * Sprint 20 — GET /api/billing/usage
 *
 * Returns the active org's current tier, current-month usage snapshot,
 * and the tier's limit table. The dashboard banners, usage-progress
 * bars, and the locked-features tooltips all read from here so there's
 * a single roundtrip for "what can this org do right now" — instead
 * of every component bouncing through resolveTierForOrg + getCurrentUsage
 * independently.
 *
 * Shape:
 *   {
 *     tier: "free" | "starter" | ...,
 *     limits: TierLimits,
 *     usage: CurrentUsage,
 *     nextTier: TierId | null,
 *     percentages: { conversations, agents, subOrgs, oauth }
 *   }
 *
 * Cached with `cache: "no-store"` semantics on the client; the
 * counters change too often (each new conversation +1) for an
 * SWR-style stale-while-revalidate to make sense.
 */

import { auth } from "@clerk/nextjs/server";
import {
  getTierLimits,
  getNextTier,
  UNLIMITED,
} from "@/lib/billing/tier-limits";
import { resolveTierForOrg } from "@/lib/billing/limit-enforcement";
import { getCurrentUsage } from "@/lib/billing/usage-tracker";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) {
    return Response.json(
      { error: "Active Clerk organization required" },
      { status: 400 },
    );
  }

  const [tier, usage] = await Promise.all([
    resolveTierForOrg(orgId),
    getCurrentUsage(orgId),
  ]);
  const limits = getTierLimits(tier);

  return Response.json({
    tier,
    limits,
    usage,
    nextTier: getNextTier(tier),
    percentages: {
      conversations: pct(usage.conversationsCount, limits.monthlyConversations),
      agents: pct(usage.agentsCount, limits.maxAgents),
      subOrgs: pct(usage.subOrgsCount, limits.maxSubOrgs),
      oauth: pct(usage.oauthConnectionsCount, limits.maxOAuthConnections),
    },
  });
}

function pct(current: number, limit: number): number {
  if (limit >= UNLIMITED) return 0;
  if (limit <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.round((current / limit) * 100));
}
