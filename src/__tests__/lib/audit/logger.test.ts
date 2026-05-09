import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  auditLog: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { logAudit, shallowDiff } from "@/lib/audit/logger";

describe("audit logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.auditLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "log_1", ...data }));
  });

  it("creates an audit entry with INFO severity by default", async () => {
    const entry = await logAudit({
      orgId: "org_a",
      action: "DEPARTMENT_ARCHIVED",
      resourceType: "DEPARTMENT",
      resourceId: "dept_1",
      actorUserId: "user_a",
    });
    expect(entry?.id).toBe("log_1");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: "org_a",
          action: "DEPARTMENT_ARCHIVED",
          severity: "INFO",
          actorType: "USER",
        }),
      }),
    );
  });

  it("uses SYSTEM actorType when no actorUserId is provided", async () => {
    await logAudit({
      orgId: "org_a",
      action: "CRON_RUN",
      resourceType: "CRON",
    });
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(data?.actorType).toBe("SYSTEM");
  });

  it("returns null and swallows errors when prisma throws", async () => {
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error("db fail"));
    const result = await logAudit({
      orgId: "org_a",
      action: "FAILS",
      resourceType: "TEST",
    });
    expect(result).toBeNull();
  });

  it("captures CRITICAL severity for sensitive actions", async () => {
    await logAudit({
      orgId: "org_a",
      action: "DSGVO_DELETE_EXECUTED",
      resourceType: "DATA_DELETION",
      severity: "CRITICAL",
    });
    expect(mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data?.severity).toBe("CRITICAL");
  });

  it("extracts ipAddress from x-forwarded-for", async () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Test/1.0" });
    await logAudit({
      orgId: "org_a",
      action: "LOGIN",
      resourceType: "USER",
      request: { headers, url: "https://example.com" } as unknown as Parameters<typeof logAudit>[0]["request"],
    });
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(data?.ipAddress).toBe("203.0.113.7");
    expect(data?.userAgent).toBe("Test/1.0");
  });

  it("respects explicit ipAddress + userAgent overrides", async () => {
    await logAudit({
      orgId: "org_a",
      action: "WEBHOOK",
      resourceType: "WEBHOOK",
      ipAddress: "10.0.0.99",
      userAgent: "Custom",
    });
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(data?.ipAddress).toBe("10.0.0.99");
    expect(data?.userAgent).toBe("Custom");
  });

  it("captures requestId from header for correlation", async () => {
    const headers = new Headers({ "x-request-id": "req-abc" });
    await logAudit({
      orgId: "org_a",
      action: "API_CALL",
      resourceType: "API",
      request: { headers, url: "https://example.com" } as unknown as Parameters<typeof logAudit>[0]["request"],
    });
    expect(mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data?.requestId).toBe("req-abc");
  });

  it("shallowDiff returns only changed keys", () => {
    const diff = shallowDiff(
      { name: "old", priority: 5, locked: true },
      { name: "new", priority: 5, locked: false },
    );
    expect(diff.before).toEqual({ name: "old", locked: true });
    expect(diff.after).toEqual({ name: "new", locked: false });
  });
});
