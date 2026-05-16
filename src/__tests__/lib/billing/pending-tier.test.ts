/**
 * Sprint 20.1.1 — PendingTier guard + constants.
 */
import { describe, expect, it } from "vitest";
import {
  PENDING_TIER_COOKIE,
  PENDING_TIER_MAX_AGE_SECONDS,
  isPendingTier,
} from "@/lib/billing/pending-tier";

describe("Sprint 20.1.1 — pending-tier guard", () => {
  it("returns true for the three paid Stripe-checkout-eligible tiers", () => {
    expect(isPendingTier("starter")).toBe(true);
    expect(isPendingTier("professional")).toBe(true);
    expect(isPendingTier("agency_pro")).toBe(true);
  });

  it("returns false for free (no Stripe checkout to fire)", () => {
    expect(isPendingTier("free")).toBe(false);
  });

  it("returns false for enterprise (mailto path, never reaches cookie)", () => {
    expect(isPendingTier("enterprise")).toBe(false);
  });

  it("returns false for the dash form (Sprint 20.1.1 — bug fix)", () => {
    expect(isPendingTier("agency-pro")).toBe(false);
  });

  it("returns false for nullish / non-string / arbitrary input", () => {
    expect(isPendingTier(null)).toBe(false);
    expect(isPendingTier(undefined)).toBe(false);
    expect(isPendingTier(42)).toBe(false);
    expect(isPendingTier("")).toBe(false);
    expect(isPendingTier("STARTER")).toBe(false);
    expect(isPendingTier({ tier: "starter" })).toBe(false);
  });

  it("exports the cookie name and max-age constants", () => {
    expect(PENDING_TIER_COOKIE).toBe("kiln-pending-tier");
    expect(PENDING_TIER_MAX_AGE_SECONDS).toBe(3600);
  });
});
