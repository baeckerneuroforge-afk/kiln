import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agencyPlatformSubscription: { findUnique: vi.fn() },
  orgRelationship: { findUnique: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  tierUsageCounter: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  agent: { count: vi.fn() },
  integrationConnection: { count: vi.fn() },
  subOrgMembership: { findMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/audit/logger", () => ({ logAudit: vi.fn().mockResolvedValue(null) }));

import {
  evaluateAndNotifyConversations,
  recordConversationAndEvaluate,
  thresholdFor,
} from "@/lib/billing/tier-notifications";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValue(null);
  mockPrisma.orgRelationship.findUnique.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.tierUsageCounter.findUnique.mockResolvedValue(null);
  mockPrisma.tierUsageCounter.upsert.mockResolvedValue({ conversationsCount: 0 });
  mockPrisma.tierUsageCounter.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.agent.count.mockResolvedValue(0);
  mockPrisma.integrationConnection.count.mockResolvedValue(0);
  mockPrisma.orgRelationship.count.mockResolvedValue(0);
  mockPrisma.subOrgMembership.findMany.mockResolvedValue([]);
});

describe("Sprint 20 — tier-notifications", () => {
  describe("thresholdFor", () => {
    it("returns null below 80%", () => {
      expect(thresholdFor(0)).toBeNull();
      expect(thresholdFor(50)).toBeNull();
      expect(thresholdFor(79)).toBeNull();
    });

    it("returns 80 at the [80, 95) boundary", () => {
      expect(thresholdFor(80)).toBe(80);
      expect(thresholdFor(94)).toBe(80);
    });

    it("returns 95 at the [95, 100) boundary", () => {
      expect(thresholdFor(95)).toBe(95);
      expect(thresholdFor(99)).toBe(95);
    });

    it("returns 100 at or above 100%", () => {
      expect(thresholdFor(100)).toBe(100);
      expect(thresholdFor(120)).toBe(100);
    });
  });

  describe("evaluateAndNotifyConversations", () => {
    // Sprint 20.1 — Free cap is 50 monthly conversations.
    it("returns fired=null when usage is under 80%", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "FREE" });
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce({
        conversationsCount: 25, // 50% of 50
      });
      const result = await evaluateAndNotifyConversations("org_low");
      expect(result.fired).toBeNull();
      expect(result.percentage).toBe(50);
      expect(result.tier).toBe("free");
    });

    it("fires the 80% threshold and marks it notified", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "FREE" });
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce({
        conversationsCount: 40, // 80% of 50
      });
      mockPrisma.tierUsageCounter.updateMany.mockResolvedValueOnce({ count: 1 });
      const result = await evaluateAndNotifyConversations("org_med");
      expect(result.fired).toBe(80);
      expect(result.percentage).toBe(80);
    });

    it("does not double-fire the same threshold within a period", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "FREE" });
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce({
        conversationsCount: 43, // 86% of 50
      });
      // Compare-and-set returns 0 → already notified earlier in the period.
      mockPrisma.tierUsageCounter.updateMany.mockResolvedValueOnce({ count: 0 });
      const result = await evaluateAndNotifyConversations("org_repeat");
      expect(result.fired).toBeNull();
      expect(result.percentage).toBe(86);
    });

    it("fires 100% with the highest-tier upgrade pointer", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "FREE" });
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce({
        conversationsCount: 50, // 100% of 50
      });
      mockPrisma.tierUsageCounter.updateMany.mockResolvedValueOnce({ count: 1 });
      const result = await evaluateAndNotifyConversations("org_max");
      expect(result.fired).toBe(100);
      expect(result.percentage).toBe(100);
    });

    it("skips evaluation on unlimited tiers", async () => {
      mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
        tier: "enterprise",
        status: "active",
      });
      const result = await evaluateAndNotifyConversations("org_unlimited");
      expect(result.fired).toBeNull();
      // No DB writes needed when tier is unlimited.
      expect(mockPrisma.tierUsageCounter.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("recordConversationAndEvaluate", () => {
    it("increments then evaluates in one call", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ plan: "FREE" });
      // 40/50 = 80% on Free
      mockPrisma.tierUsageCounter.upsert.mockResolvedValueOnce({
        conversationsCount: 40,
      });
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce({
        conversationsCount: 40,
      });
      mockPrisma.tierUsageCounter.updateMany.mockResolvedValueOnce({ count: 1 });
      const result = await recordConversationAndEvaluate("org_combined");
      expect(mockPrisma.tierUsageCounter.upsert).toHaveBeenCalledTimes(1);
      expect(result.fired).toBe(80);
    });
  });
});
