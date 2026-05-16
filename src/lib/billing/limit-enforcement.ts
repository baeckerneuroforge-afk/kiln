/**
 * Sprint 20 — Limit enforcement gate.
 *
 * Single entry point for "may this org perform action X right now?" —
 * combines the active tier (resolveTierForOrg) with current usage
 * (usage-tracker.getCurrentUsage) and compares against TIER_LIMITS.
 *
 * Throws LimitReachedError when blocked. Callers in API routes catch
 * the error and return a 403 with the upgrade-suggestion payload; the
 * UI shows the upgrade-modal pre-filled with `nextTier` and the
 * specific limit that triggered the block.
 *
 * Resource → limit mapping:
 *   "conversation"     → monthlyConversations (persisted counter)
 *   "agent"            → maxAgents             (current count)
 *   "sub_org"          → maxSubOrgs            (current count)
 *   "oauth_connection" → maxOAuthConnections   (current count)
 *   "custom_domain"    → premium feature flag (tier-level boolean)
 *   "email_sender"     → premium feature flag (tier-level boolean)
 *
 * Tier resolution prefers the agency-level AgencyPlatformSubscription
 * row when one exists (treats "active" + "trialing" as paid; anything
 * else degrades to "free"). For personal users without an agency row,
 * we fall back to the legacy User.plan enum mapped through
 * mapUserPlanToTier. New signups all start on "free".
 */

import { prisma } from "@/lib/prisma";
import type { Plan } from "@prisma/client";
import {
  getTierLimits,
  isTierId,
  UNLIMITED,
  type TierId,
  type LimitCounterKey,
} from "./tier-limits";
import { getCurrentUsage } from "./usage-tracker";

export type EnforcedResource =
  | "conversation"
  | "agent"
  | "sub_org"
  | "oauth_connection"
  | "custom_domain"
  | "email_sender";

/**
 * Thrown when a quota would be exceeded. The shape is designed for the
 * /api/* JSON envelope — the UI reads `limit`, `current`, `tier`, and
 * `nextTier` to populate the upgrade-modal copy without a second
 * round-trip.
 */
export class LimitReachedError extends Error {
  readonly code = "LIMIT_REACHED" as const;
  readonly resource: EnforcedResource;
  readonly tier: TierId;
  readonly limit: number;
  readonly current: number;
  readonly nextTier: TierId | null;

  constructor(args: {
    resource: EnforcedResource;
    tier: TierId;
    limit: number;
    current: number;
    nextTier: TierId | null;
  }) {
    super(
      `Limit reached for ${args.resource} on tier ${args.tier}: ${args.current}/${args.limit}`,
    );
    this.name = "LimitReachedError";
    this.resource = args.resource;
    this.tier = args.tier;
    this.limit = args.limit;
    this.current = args.current;
    this.nextTier = args.nextTier;
  }

  /** Serialize for the API JSON envelope. */
  toJson() {
    return {
      error: "limit_reached",
      code: this.code,
      resource: this.resource,
      tier: this.tier,
      limit: this.limit,
      current: this.current,
      nextTier: this.nextTier,
    };
  }
}

/**
 * Maps the legacy User.plan enum (FREE/STARTER/PRO/BUSINESS/AGENCY/
 * ENTERPRISE) onto Sprint 20 tier ids. PRO/BUSINESS both land on
 * "professional" because that's the closest spec analog — fine-grained
 * differentiation between them is handled by the legacy PLAN_LIMITS in
 * stripe.ts.
 */
export function mapUserPlanToTier(plan: Plan | string | null | undefined): TierId {
  switch (plan) {
    case "FREE":
      return "free";
    case "STARTER":
      return "starter";
    case "PRO":
    case "BUSINESS":
      return "professional";
    case "AGENCY":
      return "agency_pro";
    case "ENTERPRISE":
      return "enterprise";
    default:
      return "free";
  }
}

/**
 * Returns the active tier for `orgId` (a Clerk Org ID, either an
 * agency parent, a sub-org, or a personal-org). Agency platform
 * subscriptions win over User.plan when both exist — the agency row
 * is the canonical source for paid status.
 *
 * Stripe statuses other than active/trialing degrade to "free" so a
 * past-due or canceled subscription doesn't keep handing the customer
 * paid-tier quotas while their card is declined.
 */
export async function resolveTierForOrg(orgId: string): Promise<TierId> {
  // 1. Agency platform subscription wins when present + healthy.
  const agencyRow = await prisma.agencyPlatformSubscription.findUnique({
    where: { orgId },
    select: { tier: true, status: true },
  });
  if (agencyRow) {
    const tierValid = isTierId(agencyRow.tier);
    const statusActive = agencyRow.status === "active" || agencyRow.status === "trialing";
    if (tierValid && statusActive) return agencyRow.tier as TierId;
    // Any other status → fall through to free.
    return "free";
  }

  // 2. Sub-orgs inherit their parent agency's tier. The OrgRelationship
  //    table records the parent — find the relationship, then resolve
  //    recursively (max one hop; sub-org-of-sub-org isn't supported).
  const subOrgRel = await prisma.orgRelationship.findUnique({
    where: { childOrgId: orgId },
    select: { parentOrgId: true },
  });
  if (subOrgRel) {
    return resolveTierForOrg(subOrgRel.parentOrgId);
  }

  // 3. Personal user fallback — look up User by personalOrgId.
  const user = await prisma.user.findUnique({
    where: { personalOrgId: orgId },
    select: { plan: true },
  });
  if (user) return mapUserPlanToTier(user.plan);

  return "free";
}

/**
 * The mainline gate. Throws LimitReachedError when blocked, otherwise
 * resolves to void. The `count`-style resources do a strict less-than
 * check (current < limit) because the action would increment by one;
 * the premium-feature resources do a boolean flag check.
 *
 * Pass `{ tier }` to skip the resolveTierForOrg round-trip when the
 * caller already has it (rare — most call sites won't have it cached
 * and the round-trip is cheap).
 */
export async function enforceLimit(
  orgId: string,
  resource: EnforcedResource,
  opts: { tier?: TierId; at?: Date } = {},
): Promise<void> {
  const tier = opts.tier ?? (await resolveTierForOrg(orgId));
  const limits = getTierLimits(tier);

  // Premium feature flags (boolean gates).
  if (resource === "custom_domain") {
    if (!limits.customDomain) {
      throw new LimitReachedError({
        resource,
        tier,
        limit: 0,
        current: 0,
        nextTier: firstTierWithFeature("customDomain"),
      });
    }
    return;
  }
  if (resource === "email_sender") {
    if (!limits.emailSender) {
      throw new LimitReachedError({
        resource,
        tier,
        limit: 0,
        current: 0,
        nextTier: firstTierWithFeature("emailSender"),
      });
    }
    return;
  }

  // Counter-style resources.
  const usage = await getCurrentUsage(orgId, opts.at);
  const { counterKey, current, limit } = resourceComparison(resource, usage, limits);

  if (limit >= UNLIMITED) return; // unmetered tier
  if (current < limit) return;

  throw new LimitReachedError({
    resource,
    tier,
    limit,
    current,
    nextTier: nextTierAbove(tier, counterKey),
  });
}

/**
 * Same shape as enforceLimit but returns the would-throw decision
 * instead of throwing — useful for UI affordances ("hide the Create
 * Agent button when at limit"). Doesn't double-cost: a single
 * getCurrentUsage call backs both check + enforcement.
 */
export async function checkLimit(
  orgId: string,
  resource: EnforcedResource,
  opts: { tier?: TierId; at?: Date } = {},
): Promise<{ allowed: true } | { allowed: false; error: LimitReachedError }> {
  try {
    await enforceLimit(orgId, resource, opts);
    return { allowed: true };
  } catch (err) {
    if (err instanceof LimitReachedError) return { allowed: false, error: err };
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

function resourceComparison(
  resource: Exclude<EnforcedResource, "custom_domain" | "email_sender">,
  usage: Awaited<ReturnType<typeof getCurrentUsage>>,
  limits: ReturnType<typeof getTierLimits>,
): { counterKey: LimitCounterKey; current: number; limit: number } {
  switch (resource) {
    case "conversation":
      return {
        counterKey: "monthlyConversations",
        current: usage.conversationsCount,
        limit: limits.monthlyConversations,
      };
    case "agent":
      return { counterKey: "maxAgents", current: usage.agentsCount, limit: limits.maxAgents };
    case "sub_org":
      return {
        counterKey: "maxSubOrgs",
        current: usage.subOrgsCount,
        limit: limits.maxSubOrgs,
      };
    case "oauth_connection":
      return {
        counterKey: "maxOAuthConnections",
        current: usage.oauthConnectionsCount,
        limit: limits.maxOAuthConnections,
      };
  }
}

import { TIER_IDS } from "./tier-limits";

/**
 * Returns the first tier in TIER_IDS whose `counterKey` strictly
 * exceeds the current tier's value — that's the recommended upgrade
 * target. Falls through to enterprise.
 */
function nextTierAbove(currentTier: TierId, counterKey: LimitCounterKey): TierId | null {
  const currentLimit = getTierLimits(currentTier)[counterKey];
  const startIdx = TIER_IDS.indexOf(currentTier) + 1;
  for (let i = startIdx; i < TIER_IDS.length; i++) {
    const candidate = TIER_IDS[i];
    if (getTierLimits(candidate)[counterKey] > currentLimit) return candidate;
  }
  return null;
}

function firstTierWithFeature(
  feature: "customDomain" | "emailSender" | "moduleAddOns" | "removeBranding",
): TierId | null {
  for (const tier of TIER_IDS) {
    if (getTierLimits(tier)[feature]) return tier;
  }
  return null;
}
