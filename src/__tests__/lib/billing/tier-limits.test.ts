import { describe, expect, it } from "vitest";
import {
  TIER_IDS,
  TIER_LIMITS,
  UNLIMITED,
  getNextTier,
  getTierLimits,
  isTierId,
  tierHasFeature,
} from "@/lib/billing/tier-limits";

describe("Sprint 20 — tier-limits", () => {
  describe("TIER_LIMITS", () => {
    it("exports a record covering all five tier ids", () => {
      for (const tier of TIER_IDS) {
        expect(TIER_LIMITS[tier]).toBeDefined();
        expect(TIER_LIMITS[tier].tier).toBe(tier);
      }
    });

    it("Free Tier has the spec'd headline limits (Sprint 20.1 — Personal-Use-only)", () => {
      // Sprint 20.1 tightened these to match the legacy PLAN_LIMITS.FREE
      // values in stripe.ts so enforcement + marketing can't diverge.
      // Multi-tenant moves to Starter (maxSubOrgs = 0 on Free).
      expect(TIER_LIMITS.free.maxSubOrgs).toBe(0);
      expect(TIER_LIMITS.free.monthlyConversations).toBe(50);
      expect(TIER_LIMITS.free.maxAgents).toBe(1);
      expect(TIER_LIMITS.free.maxOAuthConnections).toBe(1);
      expect(TIER_LIMITS.free.monthlyPriceEur).toBe(0);
    });

    it("Free Tier gates every premium feature", () => {
      expect(TIER_LIMITS.free.customDomain).toBe(false);
      expect(TIER_LIMITS.free.emailSender).toBe(false);
      expect(TIER_LIMITS.free.moduleAddOns).toBe(false);
      expect(TIER_LIMITS.free.removeBranding).toBe(false);
    });

    it("limits increase monotonically across tiers", () => {
      // Each tier's quota should be >= the previous tier's quota.
      for (let i = 1; i < TIER_IDS.length; i++) {
        const prev = TIER_LIMITS[TIER_IDS[i - 1]];
        const curr = TIER_LIMITS[TIER_IDS[i]];
        expect(curr.monthlyConversations).toBeGreaterThanOrEqual(
          prev.monthlyConversations,
        );
        expect(curr.maxAgents).toBeGreaterThanOrEqual(prev.maxAgents);
        expect(curr.maxSubOrgs).toBeGreaterThanOrEqual(prev.maxSubOrgs);
      }
    });

    it("enterprise tier marks every counter unlimited", () => {
      const e = TIER_LIMITS.enterprise;
      expect(e.maxSubOrgs).toBeGreaterThanOrEqual(UNLIMITED);
      expect(e.monthlyConversations).toBeGreaterThanOrEqual(UNLIMITED);
      expect(e.maxAgents).toBeGreaterThanOrEqual(UNLIMITED);
      expect(e.maxOAuthConnections).toBeGreaterThanOrEqual(UNLIMITED);
    });
  });

  describe("getTierLimits", () => {
    it("returns the matching tier", () => {
      expect(getTierLimits("starter").tier).toBe("starter");
      expect(getTierLimits("agency_pro").displayName).toBe("Agency Pro");
    });

    it("falls back to Free for unknown / nullish input", () => {
      expect(getTierLimits(undefined).tier).toBe("free");
      expect(getTierLimits(null).tier).toBe("free");
      expect(getTierLimits("garbage").tier).toBe("free");
      expect(getTierLimits("").tier).toBe("free");
    });
  });

  describe("isTierId", () => {
    it("returns true only for canonical tier strings", () => {
      expect(isTierId("free")).toBe(true);
      expect(isTierId("agency_pro")).toBe(true);
      expect(isTierId("STARTER")).toBe(false);
      expect(isTierId("agencyPro")).toBe(false);
      expect(isTierId(null)).toBe(false);
      expect(isTierId(undefined)).toBe(false);
    });
  });

  describe("getNextTier", () => {
    it("walks free → starter → professional → agency_pro → enterprise", () => {
      expect(getNextTier("free")).toBe("starter");
      expect(getNextTier("starter")).toBe("professional");
      expect(getNextTier("professional")).toBe("agency_pro");
      expect(getNextTier("agency_pro")).toBe("enterprise");
    });

    it("returns null at the top of the ladder", () => {
      expect(getNextTier("enterprise")).toBeNull();
    });

    it("treats unknown / nullish input as free for the lookup", () => {
      // Falls back to free, so the next tier is starter.
      expect(getNextTier(null)).toBe("starter");
      expect(getNextTier("garbage")).toBe("starter");
    });
  });

  describe("tierHasFeature", () => {
    it("Free unlocks none of the premium features", () => {
      expect(tierHasFeature("free", "customDomain")).toBe(false);
      expect(tierHasFeature("free", "emailSender")).toBe(false);
      expect(tierHasFeature("free", "moduleAddOns")).toBe(false);
      expect(tierHasFeature("free", "removeBranding")).toBe(false);
    });

    it("Starter unlocks customDomain + emailSender but not removeBranding", () => {
      expect(tierHasFeature("starter", "customDomain")).toBe(true);
      expect(tierHasFeature("starter", "emailSender")).toBe(true);
      expect(tierHasFeature("starter", "removeBranding")).toBe(false);
    });

    it("Professional + above unlock removeBranding", () => {
      expect(tierHasFeature("professional", "removeBranding")).toBe(true);
      expect(tierHasFeature("agency_pro", "removeBranding")).toBe(true);
      expect(tierHasFeature("enterprise", "removeBranding")).toBe(true);
    });
  });
});
