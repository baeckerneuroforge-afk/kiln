import type { AgencyPlatformSubscription } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Sprint 19.5.1 — Agency platform-tier billing helpers.
 *
 * Four tiers are configured via env vars set per the Sprint 19.5 pre-flight:
 *   STRIPE_PRICE_TIER_STARTER       → "starter"        (97  EUR/month)
 *   STRIPE_PRICE_TIER_PROFESSIONAL  → "professional"   (297 EUR/month)
 *   STRIPE_PRICE_TIER_AGENCY_PRO    → "agency_pro"     (497 EUR/month)
 *   STRIPE_PRICE_TIER_ENTERPRISE    → "enterprise"     (997 EUR/month)
 *
 * Env reads are lazy at call time so the values can be set post-deploy
 * without a rebuild — same pattern as module-billing.ts.
 *
 * The subscription returned by resolveAgencyStripeSubscriptionId is the
 * one the module-billing service uses to add per-module subscription
 * items. Status-gating: only `active` and `trialing` subscriptions are
 * resolved — past_due / canceled / incomplete return null so we don't
 * attempt billing changes against a dead subscription.
 */

export const TIER_PRICE_ENV: Record<AgencyTier, string> = {
  starter: "STRIPE_PRICE_TIER_STARTER",
  professional: "STRIPE_PRICE_TIER_PROFESSIONAL",
  agency_pro: "STRIPE_PRICE_TIER_AGENCY_PRO",
  enterprise: "STRIPE_PRICE_TIER_ENTERPRISE",
};

export const TIER_MONTHLY_EUR: Record<AgencyTier, number> = {
  starter: 97,
  professional: 297,
  agency_pro: 497,
  enterprise: 997,
};

export type AgencyTier = "starter" | "professional" | "agency_pro" | "enterprise";

export type SubscriptionStatus =
  | "incomplete"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid";

const RESOLVABLE_STATUSES: ReadonlySet<string> = new Set(["active", "trialing"]);

export function isAgencyTier(value: unknown): value is AgencyTier {
  return (
    value === "starter" ||
    value === "professional" ||
    value === "agency_pro" ||
    value === "enterprise"
  );
}

/**
 * Reads the Stripe price ID for an agency tier from env. Returns null
 * when the env var is missing or whitespace; callers should treat as
 * a configuration error (this is the gate to ship the new tier system).
 */
export function getStripePriceIdForTier(tier: AgencyTier): string | null {
  const value = process.env[TIER_PRICE_ENV[tier]];
  return value && value.trim() ? value.trim() : null;
}

/**
 * Real implementation of resolveAgencyStripeSubscriptionId that the
 * module-billing service references via dynamic import. Returns the
 * agency's platform Stripe subscription id only when status indicates
 * the subscription can accept new items.
 */
export async function resolveAgencyStripeSubscriptionId(
  agencyOrgId: string,
): Promise<string | null> {
  const row = await prisma.agencyPlatformSubscription.findUnique({
    where: { orgId: agencyOrgId },
    select: { stripeSubscriptionId: true, status: true },
  });
  if (!row) return null;
  if (!row.stripeSubscriptionId) return null;
  if (!RESOLVABLE_STATUSES.has(row.status)) return null;
  return row.stripeSubscriptionId;
}

/**
 * Full record (for the dashboard + change-tier flow).
 */
export async function getAgencyPlatformSubscription(
  agencyOrgId: string,
): Promise<AgencyPlatformSubscription | null> {
  return prisma.agencyPlatformSubscription.findUnique({ where: { orgId: agencyOrgId } });
}
