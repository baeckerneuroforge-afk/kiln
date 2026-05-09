import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  auditLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { logAudit } from "@/lib/audit/logger";

describe("audit log integration scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.auditLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "log_1", ...data }));
  });

  it("approval-approved emits APPROVAL_APPROVED with INFO severity", async () => {
    await logAudit({
      orgId: "org_a",
      actorUserId: "user_a",
      action: "APPROVAL_APPROVED",
      resourceType: "BACKLOG_ITEM",
      resourceId: "item_1",
      severity: "INFO",
      metadata: { departmentId: "dept_a", executionOk: true },
    });
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(data?.action).toBe("APPROVAL_APPROVED");
    expect(data?.severity).toBe("INFO");
    expect(data?.metadata).toMatchObject({ executionOk: true });
  });

  it("approval-rejected captures the human-readable reason", async () => {
    await logAudit({
      orgId: "org_a",
      actorUserId: "user_a",
      action: "APPROVAL_REJECTED",
      resourceType: "BACKLOG_ITEM",
      resourceId: "item_2",
      description: "Approval rejected: tone too aggressive",
      metadata: { reason: "tone too aggressive" },
    });
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(data?.description).toContain("tone too aggressive");
  });

  it("department-archived emits DEPARTMENT_ARCHIVED with CRITICAL severity", async () => {
    await logAudit({
      orgId: "org_a",
      actorUserId: "user_a",
      action: "DEPARTMENT_ARCHIVED",
      resourceType: "DEPARTMENT",
      resourceId: "dept_1",
      severity: "CRITICAL",
    });
    expect(mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data?.severity).toBe("CRITICAL");
  });

  it("memory-edit captures before/after diff", async () => {
    await logAudit({
      orgId: "org_a",
      actorUserId: "user_a",
      action: "MEMORY_EDITED",
      resourceType: "MEMORY_ENTRY",
      resourceId: "entry_1",
      changes: {
        before: { content: "old", importance: 5 },
        after: { content: "new", importance: 8 },
      },
    });
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect((data?.changes as { before: Record<string, unknown> } | undefined)?.before).toMatchObject({ content: "old" });
  });

  it("sla-policy-created emits SLA_POLICY_CREATED with metadata", async () => {
    await logAudit({
      orgId: "org_a",
      actorUserId: "user_a",
      action: "SLA_POLICY_CREATED",
      resourceType: "SLA_POLICY",
      resourceId: "policy_1",
      metadata: { departmentId: "dept_a", target: 30 },
    });
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(data?.metadata).toMatchObject({ target: 30 });
  });

  it("dsgvo-export-requested emits DSGVO_EXPORT_REQUESTED", async () => {
    await logAudit({
      orgId: "org_a",
      actorUserId: "user_a",
      action: "DSGVO_EXPORT_REQUESTED",
      resourceType: "DATA_EXPORT",
      resourceId: "exp_1",
    });
    expect(mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data?.action).toBe("DSGVO_EXPORT_REQUESTED");
  });

  it("cron sweeps log with SYSTEM actorType", async () => {
    await logAudit({
      orgId: "org_a",
      actorType: "SYSTEM",
      action: "DSGVO_DELETE_EXECUTED",
      resourceType: "DATA_DELETION",
      severity: "CRITICAL",
    });
    expect(mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data?.actorType).toBe("SYSTEM");
  });

  it("webhook actor logs with WEBHOOK actorType + ipAddress", async () => {
    await logAudit({
      orgId: "org_a",
      actorType: "WEBHOOK",
      action: "INBOUND_RECEIVED",
      resourceType: "CHANNEL_MESSAGE",
      ipAddress: "203.0.113.99",
    });
    const data = mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(data?.actorType).toBe("WEBHOOK");
    expect(data?.ipAddress).toBe("203.0.113.99");
  });
});

