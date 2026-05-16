/**
 * Sprint 20 — Canonical Free-Tier limits config.
 *
 * Single source of truth for billing-tier limits + premium-feature flags.
 * Anything the enforcement layer (limit-enforcement.ts) or UI
 * (upgrade-modal, usage-progress, locked tooltips) needs to know about a
 * tier should be reachable from getTierLimits(tier).
 *
 * Tier identifiers match the platform-subscription naming used in
 * AgencyPlatformSubscription.tier (see src/lib/billing/agency-tier.ts):
 *   "free" | "starter" | "professional" | "agency_pro" | "enterprise"
 *
 * The pre-existing PLAN_LIMITS in src/lib/stripe.ts uses the legacy
 * uppercase User.plan enum (FREE/STARTER/PRO/BUSINESS/AGENCY/ENTERPRISE)
 * and tracks a much broader feature surface (computer-use, deep-research,
 * etc.). It's kept for backward-compat. This module focuses on the
 * narrow set of limits the Free-Tier enforcement layer cares about.
 *
 * NOT in this module:
 *   - Stripe price IDs        → agency-tier.ts (getStripePriceIdForTier)
 *   - Premium feature flags   → PLAN_LIMITS in stripe.ts (canHaveCustomDomain etc.)
 *   - Current usage           → usage-tracker.ts (getUsage)
 */

export type TierId =
  | "free"
  | "starter"
  | "professional"
  | "agency_pro"
  | "enterprise";

export const TIER_IDS: readonly TierId[] = [
  "free",
  "starter",
  "professional",
  "agency_pro",
  "enterprise",
] as const;

/**
 * Sentinel for unmetered counters. Avoids JS Infinity which
 * JSON-stringifies to null. Anything ≥ this means "unlimited" in
 * comparisons; in UI we render it as "∞" or "Unlimited".
 */
export const UNLIMITED = 999_999;

/**
 * What the enforcement layer + UI need to know about a tier. Counters
 * (maxSubOrgs, monthlyConversations, maxAgents, maxStorageBytes,
 * maxOAuthConnections) are checked before mutating actions. Premium
 * feature flags gate UI affordances.
 */
export interface TierLimits {
  readonly tier: TierId;
  readonly displayName: string;
  readonly monthlyPriceEur: number;

  // Counters
  readonly maxSubOrgs: number;
  readonly monthlyConversations: number;
  readonly maxAgents: number;
  readonly maxStorageBytes: number;
  readonly maxOAuthConnections: number;

  // Premium feature flags
  readonly customDomain: boolean;
  readonly emailSender: boolean;
  readonly moduleAddOns: boolean;
  readonly removeBranding: boolean;
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const TIER_LIMITS: Record<TierId, TierLimits> = {
  // Sprint 20.1 — Free is now scoped to Personal-Use only. Multi-Tenant
  // (sub-orgs) starts at Starter. These numbers intentionally match the
  // legacy PLAN_LIMITS.FREE in src/lib/stripe.ts so enforcement and
  // marketing copy can't diverge again — Sprint 20.2 will collapse the
  // two configs into one source of truth.
  free: {
    tier: "free",
    displayName: "Free",
    monthlyPriceEur: 0,
    maxSubOrgs: 0,
    monthlyConversations: 50,
    maxAgents: 1,
    maxStorageBytes: 100 * MB,
    maxOAuthConnections: 1,
    customDomain: false,
    emailSender: false,
    moduleAddOns: false,
    removeBranding: false,
  },
  starter: {
    tier: "starter",
    displayName: "Starter",
    monthlyPriceEur: 97,
    maxSubOrgs: 3,
    monthlyConversations: 1_000,
    maxAgents: 10,
    maxStorageBytes: 10 * GB,
    maxOAuthConnections: 5,
    customDomain: true,
    emailSender: true,
    moduleAddOns: true,
    removeBranding: false,
  },
  professional: {
    tier: "professional",
    displayName: "Professional",
    monthlyPriceEur: 297,
    maxSubOrgs: 10,
    monthlyConversations: 5_000,
    maxAgents: 50,
    maxStorageBytes: 50 * GB,
    maxOAuthConnections: 25,
    customDomain: true,
    emailSender: true,
    moduleAddOns: true,
    removeBranding: true,
  },
  agency_pro: {
    tier: "agency_pro",
    displayName: "Agency Pro",
    monthlyPriceEur: 497,
    maxSubOrgs: 50,
    monthlyConversations: 25_000,
    maxAgents: 200,
    maxStorageBytes: 250 * GB,
    maxOAuthConnections: 100,
    customDomain: true,
    emailSender: true,
    moduleAddOns: true,
    removeBranding: true,
  },
  enterprise: {
    tier: "enterprise",
    displayName: "Enterprise",
    monthlyPriceEur: 997,
    maxSubOrgs: UNLIMITED,
    monthlyConversations: UNLIMITED,
    maxAgents: UNLIMITED,
    maxStorageBytes: UNLIMITED * GB,
    maxOAuthConnections: UNLIMITED,
    customDomain: true,
    emailSender: true,
    moduleAddOns: true,
    removeBranding: true,
  },
} as const;

/**
 * Returns the limits for `tier`. Unknown tiers fall back to Free —
 * the conservative choice: if the tier identifier got mangled, we'd
 * rather under-serve and force a recheck than accidentally hand a
 * free-mode user enterprise quotas.
 */
export function getTierLimits(tier: TierId | string | null | undefined): TierLimits {
  if (typeof tier !== "string") return TIER_LIMITS.free;
  if (!(tier in TIER_LIMITS)) return TIER_LIMITS.free;
  return TIER_LIMITS[tier as TierId];
}

export function isTierId(value: unknown): value is TierId {
  return typeof value === "string" && value in TIER_LIMITS;
}

/**
 * Returns the next tier up from `tier`, or null if `tier` is already
 * the highest. Used by the upgrade-modal to suggest the next step.
 */
export function getNextTier(tier: TierId | string | null | undefined): TierId | null {
  const normalized = isTierId(tier) ? tier : "free";
  const idx = TIER_IDS.indexOf(normalized);
  if (idx === -1 || idx >= TIER_IDS.length - 1) return null;
  return TIER_IDS[idx + 1];
}

/**
 * "Does this tier unlock `feature`?" — convenience for UI gating.
 */
export function tierHasFeature(
  tier: TierId | string | null | undefined,
  feature: "customDomain" | "emailSender" | "moduleAddOns" | "removeBranding",
): boolean {
  const limits = getTierLimits(tier);
  return limits[feature];
}

/**
 * Counter-key names that map to TierLimits numeric fields. Used by
 * the enforcement layer to reflect on which limit was hit.
 */
export type LimitCounterKey =
  | "maxSubOrgs"
  | "monthlyConversations"
  | "maxAgents"
  | "maxStorageBytes"
  | "maxOAuthConnections";

/**
 * Human-readable label for a limit counter, used in upgrade-prompt
 * copy. Localized strings live in messages/{de,en}.json under
 * "billing.limits.*"; this is the English fallback.
 */
export const LIMIT_COUNTER_LABEL: Record<LimitCounterKey, string> = {
  maxSubOrgs: "Sub-orgs",
  monthlyConversations: "Conversations this month",
  maxAgents: "Agents",
  maxStorageBytes: "Storage",
  maxOAuthConnections: "OAuth connections",
};
