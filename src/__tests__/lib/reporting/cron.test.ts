import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  customerReportConfig: { findMany: vi.fn() },
  departmentChannelMessage: { count: vi.fn() },
}));

const mockGenerateAndSend = vi.hoisted(() => vi.fn(async () => ({ report: { id: "rep_1" }, sent: true })));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/reporting/sender", () => ({ generateAndSendForConfig: mockGenerateAndSend }));

import { runReportCron } from "@/lib/reporting/cron";

describe("reporting cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customerReportConfig.findMany.mockResolvedValue([]);
    mockPrisma.departmentChannelMessage.count.mockResolvedValue(0);
  });

  it("triggers monthly report on configured day-of-month", async () => {
    mockPrisma.customerReportConfig.findMany.mockResolvedValueOnce([
      {
        orgId: "org_a",
        frequency: "MONTHLY",
        sendDayOfMonth: 1,
        sendHour: 8,
        recipientEmails: ["owner@example.com"],
        sendOnEmpty: true,
      },
    ]);
    const result = await runReportCron(new Date("2026-11-01T10:00:00.000Z"));
    expect(result.reportsGenerated).toBe(1);
    expect(mockGenerateAndSend).toHaveBeenCalled();
  });

  it("skips monthly config when day does not match", async () => {
    mockPrisma.customerReportConfig.findMany.mockResolvedValueOnce([
      {
        orgId: "org_a",
        frequency: "MONTHLY",
        sendDayOfMonth: 15,
        sendHour: 8,
        recipientEmails: ["owner@example.com"],
        sendOnEmpty: true,
      },
    ]);
    const result = await runReportCron(new Date("2026-11-01T10:00:00.000Z"));
    expect(result.reportsGenerated).toBe(0);
  });

  it("triggers weekly report on Mondays", async () => {
    mockPrisma.customerReportConfig.findMany.mockResolvedValueOnce([
      {
        orgId: "org_a",
        frequency: "WEEKLY",
        sendDayOfMonth: 1,
        sendHour: 8,
        recipientEmails: ["owner@example.com"],
        sendOnEmpty: true,
      },
    ]);
    // Monday 11. May 2026 (need to check getUTCDay==1)
    const result = await runReportCron(new Date("2026-05-11T10:00:00.000Z"));
    expect(result.reportsGenerated).toBe(1);
  });

  it("skips configs with empty recipientEmails", async () => {
    mockPrisma.customerReportConfig.findMany.mockResolvedValueOnce([
      {
        orgId: "org_a",
        frequency: "MONTHLY",
        sendDayOfMonth: 1,
        sendHour: 8,
        recipientEmails: [],
        sendOnEmpty: true,
      },
    ]);
    const result = await runReportCron(new Date("2026-11-01T10:00:00.000Z"));
    expect(result.reportsGenerated).toBe(0);
  });

  it("respects sendOnEmpty=false when no inbound activity", async () => {
    mockPrisma.customerReportConfig.findMany.mockResolvedValueOnce([
      {
        orgId: "org_a",
        frequency: "MONTHLY",
        sendDayOfMonth: 1,
        sendHour: 8,
        recipientEmails: ["owner@example.com"],
        sendOnEmpty: false,
      },
    ]);
    mockPrisma.departmentChannelMessage.count.mockResolvedValueOnce(0);
    const result = await runReportCron(new Date("2026-11-01T10:00:00.000Z"));
    expect(result.reportsGenerated).toBe(0);
  });

  it("clamps sendDayOfMonth to 28 max", async () => {
    mockPrisma.customerReportConfig.findMany.mockResolvedValueOnce([
      {
        orgId: "org_a",
        frequency: "MONTHLY",
        sendDayOfMonth: 31, // invalid
        sendHour: 8,
        recipientEmails: ["owner@example.com"],
        sendOnEmpty: true,
      },
    ]);
    // Today is Feb 28; sendDayOfMonth clamped to 28 → matches
    const result = await runReportCron(new Date("2026-02-28T10:00:00.000Z"));
    expect(result.reportsGenerated).toBe(1);
  });
});
