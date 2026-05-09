import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  slaTracking: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { computeCompliance, listRecentBreaches } from "@/lib/sla/reports";

describe("sla reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computeCompliance returns 100% when no settled rows", async () => {
    mockPrisma.slaTracking.findMany.mockResolvedValueOnce([]);
    const report = await computeCompliance({ orgId: "org_a", windowDays: 7 });
    expect(report.compliancePercent).toBe(100);
    expect(report.met).toBe(0);
    expect(report.breached).toBe(0);
  });

  it("computeCompliance counts MET vs BREACHED accurately", async () => {
    mockPrisma.slaTracking.findMany.mockResolvedValueOnce([
      { status: "MET", firstResponseMinutes: 10 },
      { status: "MET", firstResponseMinutes: 30 },
      { status: "BREACHED", firstResponseMinutes: 90 },
      { status: "OPEN", firstResponseMinutes: null },
    ]);
    const report = await computeCompliance({ orgId: "org_a", windowDays: 7 });
    expect(report.compliancePercent).toBe(67); // 2/3
    expect(report.avgFirstResponseMinutes).toBe(43);
    expect(report.open).toBe(1);
  });

  it("computeCompliance scopes to provided departmentId", async () => {
    mockPrisma.slaTracking.findMany.mockResolvedValueOnce([]);
    await computeCompliance({ orgId: "org_a", departmentId: "dept_x", windowDays: 7 });
    const call = mockPrisma.slaTracking.findMany.mock.calls[0]?.[0];
    expect(call?.where?.departmentId).toBe("dept_x");
  });

  it("listRecentBreaches projects fields needed by the dashboard", async () => {
    const startedAt = new Date("2026-05-09T10:00:00.000Z");
    mockPrisma.slaTracking.findMany.mockResolvedValueOnce([
      {
        id: "t_1",
        departmentId: "dept_a",
        startedAt,
        firstResponseMinutes: 90,
        resolutionMinutes: null,
        customerProfileId: null,
        slaPolicy: { name: "Kritisch" },
      },
    ]);
    const breaches = await listRecentBreaches({ orgId: "org_a" });
    expect(breaches).toEqual([
      expect.objectContaining({
        id: "t_1",
        departmentId: "dept_a",
        startedAt,
        firstResponseMinutes: 90,
        policyName: "Kritisch",
      }),
    ]);
  });
});
