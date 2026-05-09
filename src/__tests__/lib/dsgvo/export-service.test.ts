import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  dataExportRequest: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  customerProfile: { findMany: vi.fn() },
  customerMemoryEntry: { findMany: vi.fn() },
  departmentChannelMessage: { findMany: vi.fn() },
  department: { findMany: vi.fn() },
  departmentWorker: { findMany: vi.fn() },
  slaPolicy: { findMany: vi.fn() },
  slaTracking: { findMany: vi.fn() },
  auditLog: { findMany: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  completeExportRequest,
  createExportRequest,
  expireOldExports,
  failExportRequest,
  gatherExportData,
} from "@/lib/dsgvo/export-service";

describe("dsgvo export-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.dataExportRequest.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "exp_1", ...data }));
    mockPrisma.dataExportRequest.update.mockImplementation(async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => ({ id: where.id, ...data, orgId: "org_a" }));
    mockPrisma.dataExportRequest.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.customerProfile.findMany.mockResolvedValue([]);
    mockPrisma.customerMemoryEntry.findMany.mockResolvedValue([]);
    mockPrisma.departmentChannelMessage.findMany.mockResolvedValue([]);
    mockPrisma.department.findMany.mockResolvedValue([]);
    mockPrisma.departmentWorker.findMany.mockResolvedValue([]);
    mockPrisma.slaPolicy.findMany.mockResolvedValue([]);
    mockPrisma.slaTracking.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("createExportRequest sets a 7-day expiry and audit logs", async () => {
    const before = Date.now();
    const row = await createExportRequest({ orgId: "org_a", requestedByUserId: "user_a" });
    const expires = (mockPrisma.dataExportRequest.create.mock.calls[0]?.[0]?.data as Record<string, unknown>)?.expiresAt as Date;
    expect(expires.getTime() - before).toBeGreaterThan(6 * 24 * 3_600_000);
    expect(row.id).toBe("exp_1");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DSGVO_EXPORT_REQUESTED" }) }),
    );
  });

  it("gatherExportData scopes to FULL by querying all tables", async () => {
    await gatherExportData({ orgId: "org_a", scope: "FULL" });
    expect(mockPrisma.customerProfile.findMany).toHaveBeenCalled();
    expect(mockPrisma.department.findMany).toHaveBeenCalled();
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalled();
  });

  it("gatherExportData CUSTOMERS_ONLY skips agents/audit", async () => {
    await gatherExportData({ orgId: "org_a", scope: "CUSTOMERS_ONLY" });
    expect(mockPrisma.customerProfile.findMany).toHaveBeenCalled();
    expect(mockPrisma.department.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("completeExportRequest marks status READY and writes audit", async () => {
    await completeExportRequest({ exportId: "exp_1", fileUrl: "https://blob/x", fileSizeBytes: 1234 });
    const update = mockPrisma.dataExportRequest.update.mock.calls[0]?.[0];
    expect(update?.data?.status).toBe("READY");
    expect(update?.data?.fileUrl).toBe("https://blob/x");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DSGVO_EXPORT_READY" }) }),
    );
  });

  it("failExportRequest marks status FAILED with error message", async () => {
    await failExportRequest({ exportId: "exp_1", errorMessage: "blob unavailable" });
    expect(mockPrisma.dataExportRequest.update.mock.calls[0]?.[0]?.data?.status).toBe("FAILED");
  });

  it("expireOldExports updates ready rows past expiresAt", async () => {
    mockPrisma.dataExportRequest.updateMany.mockResolvedValueOnce({ count: 3 });
    const count = await expireOldExports(new Date("2026-05-09T00:00:00.000Z"));
    expect(count).toBe(3);
    const call = mockPrisma.dataExportRequest.updateMany.mock.calls[0]?.[0];
    expect(call?.where?.status).toBe("READY");
    expect(call?.data?.status).toBe("EXPIRED");
  });
});
