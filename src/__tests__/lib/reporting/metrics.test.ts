import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  departmentChannelMessage: { count: vi.fn(), findMany: vi.fn() },
  departmentBacklogItem: { findMany: vi.fn(), count: vi.fn() },
  slaTracking: { findMany: vi.fn() },
  customerProfile: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { buildHighlights, computeReportMetrics } from "@/lib/reporting/metrics";

describe("reporting metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.departmentChannelMessage.count.mockResolvedValue(0);
    mockPrisma.departmentChannelMessage.findMany.mockResolvedValue([]);
    mockPrisma.departmentBacklogItem.findMany.mockResolvedValue([]);
    mockPrisma.departmentBacklogItem.count.mockResolvedValue(0);
    mockPrisma.slaTracking.findMany.mockResolvedValue([]);
    mockPrisma.customerProfile.findMany.mockResolvedValue([]);
  });

  it("computes zero-conversation period without errors", async () => {
    const metrics = await computeReportMetrics({
      orgId: "org_a",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(metrics.conversationsTotal).toBe(0);
    expect(metrics.conversationsHandled).toBe(0);
    expect(metrics.costSavedEur).toBe(0);
    expect(metrics.slaCompliancePercent).toBe(100);
  });

  it("computes conversation counts and cost savings", async () => {
    mockPrisma.departmentChannelMessage.count
      .mockResolvedValueOnce(100) // inbound
      .mockResolvedValueOnce(80); // outbound
    mockPrisma.departmentBacklogItem.findMany.mockResolvedValueOnce([]);
    mockPrisma.departmentBacklogItem.count.mockResolvedValueOnce(0);
    const metrics = await computeReportMetrics({
      orgId: "org_a",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(metrics.conversationsTotal).toBe(100);
    expect(metrics.conversationsHandled).toBe(80);
    expect(metrics.costSavedEur).toBe(680); // 80 * 8.5
  });

  it("subtracts manual escalations from cost savings", async () => {
    mockPrisma.departmentChannelMessage.count.mockResolvedValueOnce(50).mockResolvedValueOnce(50);
    mockPrisma.departmentBacklogItem.count.mockResolvedValueOnce(10);
    const metrics = await computeReportMetrics({
      orgId: "org_a",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(metrics.manualEscalations).toBe(10);
    expect(metrics.costSavedEur).toBe(340); // (50-10) * 8.5
  });

  it("computes SLA compliance percent (MET/(MET+BREACHED))", async () => {
    mockPrisma.slaTracking.findMany.mockResolvedValueOnce([
      { status: "MET", firstResponseMinutes: 5 },
      { status: "MET", firstResponseMinutes: 10 },
      { status: "BREACHED", firstResponseMinutes: 90 },
    ]);
    const metrics = await computeReportMetrics({
      orgId: "org_a",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(metrics.slaCompliancePercent).toBe(67);
    expect(metrics.avgFirstResponseMinutes).toBe(35);
  });

  it("counts new vs returning customers", async () => {
    mockPrisma.customerProfile.findMany.mockResolvedValueOnce([
      { firstSeenAt: new Date("2026-04-15"), totalConversations: 1, lastSeenAt: new Date("2026-04-15") },
      { firstSeenAt: new Date("2025-12-01"), totalConversations: 4, lastSeenAt: new Date("2026-04-15") },
      { firstSeenAt: new Date("2025-12-01"), totalConversations: 1, lastSeenAt: new Date("2026-04-15") },
    ]);
    const metrics = await computeReportMetrics({
      orgId: "org_a",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(metrics.newCustomers).toBe(1);
    expect(metrics.returningCustomers).toBe(1);
  });

  it("extracts top topics from inbound subjects", async () => {
    mockPrisma.departmentChannelMessage.findMany.mockResolvedValueOnce([
      { emailSubject: "Termin Anfrage", channel: "EMAIL", department: { name: "Reception" } },
      { emailSubject: "Termin Anfrage", channel: "EMAIL", department: { name: "Reception" } },
      { emailSubject: "Beschwerde", channel: "EMAIL", department: { name: "Support" } },
    ]);
    const metrics = await computeReportMetrics({
      orgId: "org_a",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(metrics.topTopics[0]?.topic).toBe("termin anfrage");
    expect(metrics.topTopics[0]?.count).toBe(2);
  });

  it("buildHighlights yields German strings with formatted numbers", () => {
    const highlights = buildHighlights(
      {
        conversationsTotal: 247,
        conversationsHandled: 240,
        manualEscalations: 7,
        approvalsTotal: 100,
        approvalsApproved: 90,
        approvalsRejected: 10,
        approvalsRate: 100,
        slaCompliancePercent: 92,
        slaTrackingsCount: 50,
        avgFirstResponseMinutes: 8,
        newCustomers: 14,
        returningCustomers: 22,
        topTopics: [],
        costSavedEur: 4800,
      },
      "Oktober 2026",
    );
    expect(highlights.some((line) => line.includes("247 Anfragen"))).toBe(true);
    expect(highlights.some((line) => line.includes("92%"))).toBe(true);
    expect(highlights.some((line) => line.includes("4.800"))).toBe(true);
  });

  it("respects custom cost-per-conversation override", async () => {
    mockPrisma.departmentChannelMessage.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);
    const metrics = await computeReportMetrics({
      orgId: "org_a",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
      costPerConversationEur: 12,
    });
    expect(metrics.costSavedEur).toBe(120); // 10 * 12
  });
});
