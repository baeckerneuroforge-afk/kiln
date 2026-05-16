import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agencyPlatformSubscription: { findUnique: vi.fn() },
  orgRelationship: { findUnique: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn() },
  tierUsageCounter: { findUnique: vi.fn() },
  agent: { count: vi.fn() },
  integrationConnection: { count: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  LimitReachedError,
  checkLimit,
  enforceLimit,
  mapUserPlanToTier,
  resolveTierForOrg,
} from "@/lib/billing/limit-enforcement";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValue(null);
  mockPrisma.orgRelationship.findUnique.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.tierUsageCounter.findUnique.mockResolvedValue(null);
  mockPrisma.agent.count.mockResolvedValue(0);
  mockPrisma.integrationConnection.count.mockResolvedValue(0);
  mockPrisma.orgRelationship.count.mockResolvedValue(0);
});

describe("Sprint 20 — limit-enforcement", () => {
  describe("mapUserPlanToTier", () => {
    it("maps every Plan enum value to a TierId", () => {
      expect(mapUserPlanToTier("FREE")).toBe("free");
      expect(mapUserPlanToTier("STARTER")).toBe("starter");
      expect(mapUserPlanToTier("PRO")).toBe("professional");
      expect(mapUserPlanToTier("BUSINESS")).toBe("professional");
      expect(mapUserPlanToTier("AGENCY")).toBe("agency_pro");
      expect(mapUserPlanToTier("ENTERPRISE")).toBe("enterprise");
    });

    it("falls back to free for nullish / unknown input", () => {
      expect(mapUserPlanToTier(null)).toBe("free");
      expect(mapUserPlanToTier(undefined)).toBe("free");
      expect(mapUserPlanToTier("WAT")).toBe("free");
    });
  });

  describe("resolveTierForOrg", () => {
    it("returns the agency tier when the subscription is active", async () => {
      mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
        tier: "professional",
        status: "active",
      });
      expect(await resolveTierForOrg("org_a")).toBe("professional");
    });

    it("degrades to free when the subscription is past_due", async () => {
      mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
        tier: "agency_pro",
        status: "past_due",
      });
      expect(await resolveTierForOrg("org_b")).toBe("free");
    });

    it("inherits the parent tier for sub-orgs", async () => {
      // Lookup 1: sub-org has no AgencyPlatformSubscription
      mockPrisma.agencyPlatformSubscription.findUnique
        .mockResolvedValueOnce(null)
        // Lookup 2 (recursive): parent has an active subscription
        .mockResolvedValueOnce({ tier: "starter", status: "active" });
      mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({
        parentOrgId: "org_parent",
      });
      expect(await resolveTierForOrg("org_child")).toBe("starter");
    });

    it("falls back to User.plan for personal orgs", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "PRO" });
      expect(await resolveTierForOrg("org_personal")).toBe("professional");
    });

    it("returns free for orgs that aren't in any table", async () => {
      expect(await resolveTierForOrg("org_orphan")).toBe("free");
    });
  });

  describe("enforceLimit — conversation counter", () => {
    it("passes when under the limit", async () => {
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce({
        conversationsCount: 50,
      });
      // Free tier → 100 monthly conversations
      await expect(
        enforceLimit("org_x", "conversation", { tier: "free" }),
      ).resolves.toBeUndefined();
    });

    it("throws LimitReachedError when at the cap", async () => {
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce({
        conversationsCount: 100,
      });
      await expect(
        enforceLimit("org_y", "conversation", { tier: "free" }),
      ).rejects.toBeInstanceOf(LimitReachedError);
    });

    it("attaches nextTier suggestion to the error", async () => {
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce({
        conversationsCount: 100,
      });
      try {
        await enforceLimit("org_y", "conversation", { tier: "free" });
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(LimitReachedError);
        const e = err as LimitReachedError;
        expect(e.tier).toBe("free");
        expect(e.nextTier).toBe("starter");
        expect(e.toJson()).toMatchObject({
          code: "LIMIT_REACHED",
          resource: "conversation",
          tier: "free",
          limit: 100,
          current: 100,
          nextTier: "starter",
        });
      }
    });
  });

  describe("enforceLimit — premium feature flags", () => {
    it("blocks custom_domain on free", async () => {
      await expect(
        enforceLimit("org_z", "custom_domain", { tier: "free" }),
      ).rejects.toBeInstanceOf(LimitReachedError);
    });

    it("allows custom_domain on starter", async () => {
      await expect(
        enforceLimit("org_z", "custom_domain", { tier: "starter" }),
      ).resolves.toBeUndefined();
    });

    it("nextTier for custom_domain on free is starter", async () => {
      try {
        await enforceLimit("org_z", "custom_domain", { tier: "free" });
      } catch (err) {
        expect((err as LimitReachedError).nextTier).toBe("starter");
      }
    });
  });

  describe("checkLimit", () => {
    it("returns { allowed: true } when under the cap", async () => {
      mockPrisma.agent.count.mockResolvedValueOnce(1);
      const result = await checkLimit("org_w", "agent", { tier: "free" });
      expect(result.allowed).toBe(true);
    });

    it("returns { allowed: false, error } when over the cap", async () => {
      mockPrisma.agent.count.mockResolvedValueOnce(3);
      const result = await checkLimit("org_w", "agent", { tier: "free" });
      if (result.allowed) throw new Error("expected blocked");
      expect(result.error).toBeInstanceOf(LimitReachedError);
      expect(result.error.resource).toBe("agent");
    });
  });
});
