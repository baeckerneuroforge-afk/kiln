import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  customerReport: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));

const mockSendBranded = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/send-branded-email", () => ({ sendBrandedEmail: mockSendBranded }));

import { sendCustomerReport } from "@/lib/reporting/sender";

const reportRow = (overrides: Partial<{ id: string; recipientEmail: string; metrics: unknown; status: string }> = {}) => ({
  id: overrides.id ?? "rep_1",
  orgId: "org_a",
  periodType: "MONTHLY",
  periodStart: new Date("2026-10-01"),
  periodEnd: new Date("2026-11-01"),
  status: overrides.status ?? "READY",
  recipientEmail: overrides.recipientEmail ?? "owner@example.com",
  recipientName: null,
  metrics: overrides.metrics ?? {
    conversationsTotal: 50,
    slaCompliancePercent: 92,
    costSavedEur: 425,
    newCustomers: 4,
    returningCustomers: 6,
    approvalsTotal: 30,
    avgFirstResponseMinutes: 12,
    topTopics: [],
  },
  highlights: ["50 Anfragen bearbeitet"],
  htmlBody: "<html>x</html>",
  sentAt: null,
  errorMessage: null,
  triggerType: "MANUAL",
  triggeredByUserId: null,
});

describe("reporting sender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customerReport.update.mockImplementation(async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => ({ id: where.id, ...data }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("returns error when report id is unknown", async () => {
    mockPrisma.customerReport.findUnique.mockResolvedValueOnce(null);
    const result = await sendCustomerReport("missing");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("report-not-found");
  });

  it("sends and marks SENT when branded email succeeds", async () => {
    mockPrisma.customerReport.findUnique.mockResolvedValueOnce(reportRow());
    mockSendBranded.mockResolvedValueOnce({ ok: true, externalId: "ext_1" });
    const result = await sendCustomerReport("rep_1");
    expect(result.ok).toBe(true);
    const update = mockPrisma.customerReport.update.mock.calls[0]?.[0];
    expect(update?.data?.status).toBe("SENT");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "REPORT_SENT" }) }),
    );
  });

  it("marks FAILED when branded email returns error", async () => {
    mockPrisma.customerReport.findUnique.mockResolvedValueOnce(reportRow());
    mockSendBranded.mockResolvedValueOnce({ ok: false, error: "rate-limited" });
    const result = await sendCustomerReport("rep_1");
    expect(result.ok).toBe(false);
    const update = mockPrisma.customerReport.update.mock.calls[0]?.[0];
    expect(update?.data?.status).toBe("FAILED");
    expect(update?.data?.errorMessage).toBe("rate-limited");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "REPORT_SEND_FAILED" }) }),
    );
  });

  it("guards against missing recipientEmail with FAILED status", async () => {
    mockPrisma.customerReport.findUnique.mockResolvedValueOnce(reportRow({ recipientEmail: "" }));
    const result = await sendCustomerReport("rep_1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing-recipient");
  });
});
