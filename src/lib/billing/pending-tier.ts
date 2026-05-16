/**
 * Sprint 20.1.1 — Cookie-based tier-intent persistence across sign-up.
 *
 * The marketing pricing-page can be clicked by a logged-out visitor. The
 * tier-CTA forwards them to /sign-up?tier=<api-tier-id>. The sign-up
 * server-component sets a short-lived cookie capturing the intent, so
 * the first dashboard render after Clerk completes onboarding can
 * trigger /api/billing/upgrade automatically (no second pricing-page
 * visit needed).
 *
 * Cookie is intentionally NOT HttpOnly — it's UX state, not auth state.
 * A user who forges the cookie can at worst start a Stripe Checkout
 * session for a tier they wanted anyway; the actual billing intent
 * is re-validated by /api/billing/upgrade against TierId. Max-age is
 * one hour: enough for sign-up + email-verification on a slow device,
 * short enough that a stale intent doesn't ambush a return visitor
 * who came back through some other path.
 *
 * The valid set is { starter, professional, agency_pro }. "free"
 * doesn't go through the cookie (the sign-up banner alone is the
 * surface for free, and there's nothing to checkout). "enterprise"
 * goes through the mailto/sales flow, not the Stripe path.
 */

import type { TierId } from "./tier-limits";

export const PENDING_TIER_COOKIE = "kiln-pending-tier";
export const PENDING_TIER_MAX_AGE_SECONDS = 60 * 60; // 1 hour

/** Tiers that are eligible to set the post-signup checkout cookie. */
export type PendingTier = Extract<
  TierId,
  "starter" | "professional" | "agency_pro"
>;

const VALID: ReadonlySet<string> = new Set<PendingTier>([
  "starter",
  "professional",
  "agency_pro",
]);

export function isPendingTier(value: unknown): value is PendingTier {
  return typeof value === "string" && VALID.has(value);
}
