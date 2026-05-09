import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  departmentChannelMessage: { count: vi.fn(), findMany: vi.fn() },
  departmentBacklogItem: { findMany: vi.fn(), count: vi.fn() },
  slaTracking: { findMany: vi.fn() },
  customerProfile: { findMany: vi.fn() },
  customerReport: { create: vi.fn(), update: vi.fn() },
}));

const mockResolveBranding = vi.hoisted(() =>
  vi.fn(async () => ({
    brandName: "Hephaistos",
    logoUrl: null,
    brandColor: "#F97316",
    fromAddress: "info@hephaistos.test",
    fromName: "Hephaistos",
    replyTo: null,
    footerHtml: "Powered by Hephaistos",
    supportLink: null,
    isDefaultBranding: false,
  })),
);

const mockRender = vi.hoisted(() =>
  vi.fn(async () => ({ html: "<html>HELLO {{customMessage}}</html>", text: "HELLO", subject: "[Hephaistos] Oktober 2026 Report" })),
);

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/branding-resolver", () => ({ resolveEmailBranding: mockResolveBranding }));
vi.mock("@/lib/email/template-renderer", () => ({ renderEmail: mockRender }));

import {
  generateReport,
  monthLabelFor,
  previousMonthRange,
  previousWeekRange,
} from "@/lib/reporting/generator";

describe("reporting generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.departmentChannelMessage.count.mockResolvedValue(0);
    mockPrisma.departmentChannelMessage.findMany.mockResolvedValue([]);
    mockPrisma.departmentBacklogItem.findMany.mockResolvedValue([]);
    mockPrisma.departmentBacklogItem.count.mockResolvedValue(0);
    mockPrisma.slaTracking.findMany.mockResolvedValue([]);
    mockPrisma.customerProfile.findMany.mockResolvedValue([]);
    mockPrisma.customerReport.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "rep_1", ...data }));
  });

  it("monthLabelFor returns German month label", () => {
    expect(monthLabelFor(new Date("2026-10-15T00:00:00.000Z"))).toContain("Oktober");
  });

  it("previousMonthRange returns 1st of last month → 1st of this month", () => {
    const range = previousMonthRange(new Date("2026-11-15T00:00:00.000Z"));
    expect(range.start.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(range.end.toISOString().slice(0, 10)).toBe("2026-11-01");
  });

  it("previousWeekRange returns last full Mon-Mon week", () => {
    const range = previousWeekRange(new Date("2026-05-13T12:00:00.000Z")); // Wed
    expect(range.start.toISOString().slice(0, 10)).toBe("2026-05-04");
    expect(range.end.toISOString().slice(0, 10)).toBe("2026-05-11");
  });

  it("preview mode renders without persisting", async () => {
    const result = await generateReport({
      orgId: "org_a",
      periodStart: new Date("2026-10-01"),
      periodEnd: new Date("2026-11-01"),
      recipientEmail: "owner@example.com",
      preview: true,
    });
    expect(result.htmlBody).toContain("HELLO");
    expect(result.report).toBeUndefined();
    expect(mockPrisma.customerReport.create).not.toHaveBeenCalled();
  });

  it("non-preview mode persists CustomerReport with status READY", async () => {
    const result = await generateReport({
      orgId: "org_a",
      periodStart: new Date("2026-10-01"),
      periodEnd: new Date("2026-11-01"),
      recipientEmail: "owner@example.com",
      triggerType: "MANUAL",
      triggeredByUserId: "user_a",
    });
    expect(result.report?.id).toBe("rep_1");
    const data = mockPrisma.customerReport.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data?.status).toBe("READY");
    expect(data?.triggerType).toBe("MANUAL");
    expect(data?.recipientEmail).toBe("owner@example.com");
  });

  it("uses branding-resolver and renders monthly-report template", async () => {
    await generateReport({
      orgId: "org_a",
      periodStart: new Date("2026-10-01"),
      periodEnd: new Date("2026-11-01"),
      recipientEmail: "owner@example.com",
      preview: true,
    });
    expect(mockResolveBranding).toHaveBeenCalledWith({ orgId: "org_a", subOrgId: "org_a" });
    expect(mockRender).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "monthly-report",
        data: expect.objectContaining({ customerName: "Hephaistos" }),
      }),
    );
  });

  it("passes customMessage through to renderer", async () => {
    await generateReport({
      orgId: "org_a",
      periodStart: new Date("2026-10-01"),
      periodEnd: new Date("2026-11-01"),
      recipientEmail: "owner@example.com",
      customMessage: "Vielen Dank für Ihre Zusammenarbeit!",
      preview: true,
    });
    const callData = mockRender.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(callData?.customMessage).toBe("Vielen Dank für Ihre Zusammenarbeit!");
  });

  it("falls back to no-recipient placeholder when no email available", async () => {
    const result = await generateReport({
      orgId: "org_a",
      periodStart: new Date("2026-10-01"),
      periodEnd: new Date("2026-11-01"),
      preview: true,
    });
    expect(result.recipientEmail).toContain("@kilnbase.invalid");
  });
});
