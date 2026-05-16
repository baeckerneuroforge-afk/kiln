import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  tierUsageCounter: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  agent: { count: vi.fn() },
  integrationConnection: { count: vi.fn() },
  orgRelationship: { count: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  getCurrentUsage,
  getNotificationState,
  incrementConversations,
  markThresholdNotified,
  periodMonthFor,
} from "@/lib/billing/usage-tracker";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.tierUsageCounter.findUnique.mockResolvedValue(null);
  mockPrisma.tierUsageCounter.upsert.mockResolvedValue({ conversationsCount: 0 });
  mockPrisma.tierUsageCounter.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.agent.count.mockResolvedValue(0);
  mockPrisma.integrationConnection.count.mockResolvedValue(0);
  mockPrisma.orgRelationship.count.mockResolvedValue(0);
});

describe("Sprint 20 — usage-tracker", () => {
  describe("periodMonthFor", () => {
    it("formats UTC year-month as YYYY-MM", () => {
      expect(periodMonthFor(new Date("2026-05-16T12:00:00Z"))).toBe("2026-05");
      expect(periodMonthFor(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
      expect(periodMonthFor(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
    });

    it("pads the month to two digits", () => {
      expect(periodMonthFor(new Date("2026-03-15T00:00:00Z"))).toBe("2026-03");
    });
  });

  describe("getCurrentUsage", () => {
    it("combines counter + on-demand counts into one snapshot", async () => {
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce({
        conversationsCount: 42,
      });
      mockPrisma.agent.count.mockResolvedValueOnce(7);
      mockPrisma.integrationConnection.count.mockResolvedValueOnce(2);
      mockPrisma.orgRelationship.count.mockResolvedValueOnce(3);

      const result = await getCurrentUsage(
        "org_123",
        new Date("2026-05-16T00:00:00Z"),
      );
      expect(result).toMatchObject({
        orgId: "org_123",
        periodMonth: "2026-05",
        conversationsCount: 42,
        agentsCount: 7,
        oauthConnectionsCount: 2,
        subOrgsCount: 3,
        storageUsedBytes: 0,
      });
    });

    it("returns zero for conversations when no counter row exists yet", async () => {
      const result = await getCurrentUsage("org_456");
      expect(result.conversationsCount).toBe(0);
    });

    it("only counts active integration connections", async () => {
      await getCurrentUsage("org_789");
      expect(mockPrisma.integrationConnection.count).toHaveBeenCalledWith({
        where: { orgId: "org_789", isActive: true },
      });
    });

    it("only counts ACTIVE sub-org relationships", async () => {
      await getCurrentUsage("org_999");
      expect(mockPrisma.orgRelationship.count).toHaveBeenCalledWith({
        where: { parentOrgId: "org_999", subOrgStatus: "ACTIVE" },
      });
    });
  });

  describe("incrementConversations", () => {
    it("upserts with a fresh row + delta when none exists", async () => {
      mockPrisma.tierUsageCounter.upsert.mockResolvedValueOnce({
        conversationsCount: 1,
      });
      const result = await incrementConversations(
        "org_abc",
        1,
        new Date("2026-05-16T00:00:00Z"),
      );
      expect(result).toBe(1);
      expect(mockPrisma.tierUsageCounter.upsert).toHaveBeenCalledWith({
        where: { orgId_periodMonth: { orgId: "org_abc", periodMonth: "2026-05" } },
        create: { orgId: "org_abc", periodMonth: "2026-05", conversationsCount: 1 },
        update: { conversationsCount: { increment: 1 } },
      });
    });

    it("increments by delta on existing rows", async () => {
      mockPrisma.tierUsageCounter.upsert.mockResolvedValueOnce({
        conversationsCount: 7,
      });
      const result = await incrementConversations("org_xyz", 3);
      expect(result).toBe(7);
      expect(mockPrisma.tierUsageCounter.upsert.mock.calls[0][0].update).toEqual({
        conversationsCount: { increment: 3 },
      });
    });
  });

  describe("markThresholdNotified", () => {
    it("returns true when the compare-and-set flips the field", async () => {
      mockPrisma.tierUsageCounter.updateMany.mockResolvedValueOnce({ count: 1 });
      const fired = await markThresholdNotified(
        "org_a",
        80,
        new Date("2026-05-16T00:00:00Z"),
      );
      expect(fired).toBe(true);
      expect(mockPrisma.tierUsageCounter.updateMany).toHaveBeenCalledWith({
        where: { orgId: "org_a", periodMonth: "2026-05", notifiedAt80: null },
        data: { notifiedAt80: expect.any(Date) },
      });
    });

    it("returns false when the threshold was already notified", async () => {
      mockPrisma.tierUsageCounter.updateMany.mockResolvedValueOnce({ count: 0 });
      const fired = await markThresholdNotified("org_b", 95);
      expect(fired).toBe(false);
    });

    it("uses the right field per threshold", async () => {
      mockPrisma.tierUsageCounter.updateMany.mockResolvedValue({ count: 1 });

      await markThresholdNotified("org_c", 80);
      expect(mockPrisma.tierUsageCounter.updateMany.mock.calls[0][0].where).toHaveProperty("notifiedAt80");

      await markThresholdNotified("org_c", 95);
      expect(mockPrisma.tierUsageCounter.updateMany.mock.calls[1][0].where).toHaveProperty("notifiedAt95");

      await markThresholdNotified("org_c", 100);
      expect(mockPrisma.tierUsageCounter.updateMany.mock.calls[2][0].where).toHaveProperty("notifiedAt100");
    });
  });

  describe("getNotificationState", () => {
    it("returns null when no row exists for the period", async () => {
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce(null);
      const state = await getNotificationState("org_none");
      expect(state).toBeNull();
    });

    it("returns the three notification timestamps when the row exists", async () => {
      const stamp = new Date("2026-05-15T00:00:00Z");
      mockPrisma.tierUsageCounter.findUnique.mockResolvedValueOnce({
        notifiedAt80: stamp,
        notifiedAt95: null,
        notifiedAt100: null,
      });
      const state = await getNotificationState("org_q");
      expect(state).toEqual({
        notifiedAt80: stamp,
        notifiedAt95: null,
        notifiedAt100: null,
      });
    });
  });
});
