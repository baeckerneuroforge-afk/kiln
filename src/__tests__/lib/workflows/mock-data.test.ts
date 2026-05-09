import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => {
  const tx = {
    workflowMockData: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return {
    ...tx,
    $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  deleteMockData,
  listMockData,
  pickMockData,
  saveMockData,
  setDefaultMockData,
} from "@/lib/workflows/mock-data";

describe("workflows mock-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.workflowMockData.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "mock_1", ...data }));
    mockPrisma.workflowMockData.update.mockImplementation(async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => ({ id: where.id, ...data }));
    mockPrisma.workflowMockData.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.workflowMockData.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("saveMockData rejects empty name", async () => {
    await expect(
      saveMockData({ orgId: "org_a", workflowId: "wf_1", nodeId: "node_a", name: "  ", data: {} }),
    ).rejects.toThrow();
  });

  it("saveMockData rejects payload over 256 KB", async () => {
    const big = "x".repeat(300_000);
    await expect(
      saveMockData({ orgId: "org_a", workflowId: "wf_1", nodeId: "node_a", name: "big", data: big }),
    ).rejects.toThrow(/exceeds/);
  });

  it("saveMockData clears previous default when isDefault=true", async () => {
    await saveMockData({
      orgId: "org_a",
      workflowId: "wf_1",
      nodeId: "node_a",
      name: "primary",
      data: { ok: true },
      isDefault: true,
    });
    const updateMany = mockPrisma.workflowMockData.updateMany.mock.calls[0]?.[0];
    expect(updateMany?.where?.isDefault).toBe(true);
    expect(updateMany?.data?.isDefault).toBe(false);
  });

  it("saveMockData persists with truncated name", async () => {
    const longName = "a".repeat(200);
    await saveMockData({
      orgId: "org_a",
      workflowId: "wf_1",
      nodeId: "node_a",
      name: longName,
      data: {},
    });
    const data = mockPrisma.workflowMockData.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(typeof data?.name).toBe("string");
    expect((data?.name as string).length).toBeLessThanOrEqual(80);
  });

  it("listMockData scopes by orgId + workflowId + nodeId", async () => {
    mockPrisma.workflowMockData.findMany.mockResolvedValueOnce([]);
    await listMockData({ orgId: "org_a", workflowId: "wf_1", nodeId: "node_a" });
    const where = mockPrisma.workflowMockData.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ orgId: "org_a", workflowId: "wf_1", nodeId: "node_a" });
  });

  it("pickMockData returns null when no rows exist", async () => {
    mockPrisma.workflowMockData.findMany.mockResolvedValueOnce([]);
    const result = await pickMockData({ orgId: "org_a", workflowId: "wf_1", nodeId: "node_a" });
    expect(result).toBeNull();
  });

  it("pickMockData prefers explicit name match", async () => {
    mockPrisma.workflowMockData.findMany.mockResolvedValueOnce([
      { id: "1", name: "default", isDefault: true, data: { kind: "default" }, orgId: "org_a", workflowId: "wf_1", nodeId: "node_a" },
      { id: "2", name: "alt", isDefault: false, data: { kind: "alt" }, orgId: "org_a", workflowId: "wf_1", nodeId: "node_a" },
    ]);
    const result = await pickMockData({
      orgId: "org_a",
      workflowId: "wf_1",
      nodeId: "node_a",
      name: "alt",
    });
    expect(result).toEqual({ kind: "alt" });
  });

  it("pickMockData falls back to default when name not found", async () => {
    mockPrisma.workflowMockData.findMany.mockResolvedValueOnce([
      { id: "1", name: "default", isDefault: true, data: { kind: "default" } },
    ]);
    const result = await pickMockData({
      orgId: "org_a",
      workflowId: "wf_1",
      nodeId: "node_a",
      name: "missing",
    });
    expect(result).toEqual({ kind: "default" });
  });

  it("setDefaultMockData rejects unknown id", async () => {
    mockPrisma.workflowMockData.findFirst.mockResolvedValueOnce(null);
    const result = await setDefaultMockData({ orgId: "org_a", id: "missing" });
    expect(result).toBeNull();
  });

  it("setDefaultMockData clears previous default and flips this one", async () => {
    mockPrisma.workflowMockData.findFirst.mockResolvedValueOnce({
      id: "mock_1",
      orgId: "org_a",
      workflowId: "wf_1",
      nodeId: "node_a",
      isDefault: false,
    });
    await setDefaultMockData({ orgId: "org_a", id: "mock_1" });
    expect(mockPrisma.workflowMockData.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isDefault: false } }),
    );
    const update = mockPrisma.workflowMockData.update.mock.calls[0]?.[0];
    expect(update?.data?.isDefault).toBe(true);
  });

  it("deleteMockData scopes deleteMany by orgId", async () => {
    mockPrisma.workflowMockData.deleteMany.mockResolvedValueOnce({ count: 1 });
    const ok = await deleteMockData({ orgId: "org_a", id: "mock_1" });
    expect(ok).toBe(true);
    expect(mockPrisma.workflowMockData.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "mock_1", orgId: "org_a" } }),
    );
  });

  it("deleteMockData returns false when no row matched", async () => {
    mockPrisma.workflowMockData.deleteMany.mockResolvedValueOnce({ count: 0 });
    const ok = await deleteMockData({ orgId: "org_a", id: "mock_1" });
    expect(ok).toBe(false);
  });
});
