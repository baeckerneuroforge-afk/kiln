import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => {
  const tx = {
    departmentChannelMessage: { deleteMany: vi.fn() },
    customerProfileAudit: { deleteMany: vi.fn() },
    customerMemoryEntry: { deleteMany: vi.fn() },
    customerProfile: { deleteMany: vi.fn() },
    slaTracking: { deleteMany: vi.fn() },
    slaPolicy: { deleteMany: vi.fn() },
    department: { deleteMany: vi.fn() },
    auditLog: { deleteMany: vi.fn() },
  };
  return {
    ...tx,
    dataDeletionRequest: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: { ...tx.auditLog, create: vi.fn() },
    $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  cancelDeletionRequest,
  createDeletionRequest,
  executeDeletion,
  findDueDeletions,
} from "@/lib/dsgvo/delete-service";

describe("dsgvo delete-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.dataDeletionRequest.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "del_1", ...data }));
    mockPrisma.dataDeletionRequest.update.mockImplementation(async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => ({ id: where.id, ...data, orgId: "org_a" }));
    mockPrisma.departmentChannelMessage.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.customerProfileAudit.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.customerMemoryEntry.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.customerProfile.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.slaTracking.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.slaPolicy.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.department.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("createDeletionRequest sets graceUntil 30 days out and audit logs CRITICAL", async () => {
    const before = Date.now();
    await createDeletionRequest({ orgId: "org_a", requestedByUserId: "user_a", reason: "leaving" });
    const data = mockPrisma.dataDeletionRequest.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    const grace = data.graceUntil as Date;
    expect(grace.getTime() - before).toBeGreaterThan(29 * 24 * 3_600_000);
    expect(data.status).toBe("GRACE_PERIOD");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DSGVO_DELETE_REQUESTED", severity: "CRITICAL" }) }),
    );
  });

  it("cancelDeletionRequest flips status to CANCELLED for grace-period rows", async () => {
    mockPrisma.dataDeletionRequest.findFirst.mockResolvedValueOnce({
      id: "del_1",
      orgId: "org_a",
      status: "GRACE_PERIOD",
    });
    await cancelDeletionRequest({ deletionId: "del_1", orgId: "org_a", actorUserId: "user_a" });
    const update = mockPrisma.dataDeletionRequest.update.mock.calls[0]?.[0];
    expect(update?.data?.status).toBe("CANCELLED");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DSGVO_DELETE_CANCELLED" }) }),
    );
  });

  it("cancelDeletionRequest throws for already-PROCESSING deletions", async () => {
    mockPrisma.dataDeletionRequest.findFirst.mockResolvedValueOnce({
      id: "del_1",
      orgId: "org_a",
      status: "PROCESSING",
    });
    await expect(
      cancelDeletionRequest({ deletionId: "del_1", orgId: "org_a", actorUserId: "user_a" }),
    ).rejects.toThrow();
  });

  it("executeDeletion cascades deletions and writes counts", async () => {
    mockPrisma.dataDeletionRequest.findUnique.mockResolvedValueOnce({
      id: "del_1",
      orgId: "org_a",
      status: "GRACE_PERIOD",
      scope: "FULL",
    });
    mockPrisma.customerProfile.deleteMany.mockResolvedValueOnce({ count: 4 });
    mockPrisma.department.deleteMany.mockResolvedValueOnce({ count: 2 });
    mockPrisma.auditLog.deleteMany.mockResolvedValueOnce({ count: 25 });
    const result = await executeDeletion({ deletionId: "del_1" });
    expect(result?.counts.customerProfiles).toBe(4);
    expect(result?.counts.departments).toBe(2);
    expect(result?.counts.auditLog).toBe(25);
    const finalUpdate = mockPrisma.dataDeletionRequest.update.mock.calls.at(-1)?.[0];
    expect(finalUpdate?.data?.status).toBe("COMPLETED");
  });

  it("executeDeletion CUSTOMERS_ONLY does not delete audit log", async () => {
    mockPrisma.dataDeletionRequest.findUnique.mockResolvedValueOnce({
      id: "del_1",
      orgId: "org_a",
      status: "GRACE_PERIOD",
      scope: "CUSTOMERS_ONLY",
    });
    await executeDeletion({ deletionId: "del_1" });
    expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it("findDueDeletions returns rows whose graceUntil is past now", async () => {
    mockPrisma.dataDeletionRequest.findMany.mockResolvedValueOnce([{ id: "del_1" }]);
    const due = await findDueDeletions(new Date("2026-06-01T00:00:00.000Z"));
    expect(due).toHaveLength(1);
    const call = mockPrisma.dataDeletionRequest.findMany.mock.calls[0]?.[0];
    expect(call?.where?.status?.in).toContain("GRACE_PERIOD");
  });
});
