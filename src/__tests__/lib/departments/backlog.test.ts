import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  departmentBacklogItem: {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  department: {
    update: vi.fn(),
  },
}));

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn((fn) => fn(tx)),
  departmentBacklogItem: {
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  claimNextPending,
  enqueueTask,
  markDone,
  markFailed,
  markNeedsApproval,
  markRunning,
} from "@/lib/departments/backlog";

describe("department backlog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues a task and increments department stats", async () => {
    tx.departmentBacklogItem.create.mockResolvedValue({ id: "item_1" });
    await expect(
      enqueueTask({
        departmentId: "dept_1",
        triggerType: "MANUAL",
        triggerPayload: { ticket: 1 },
      })
    ).resolves.toEqual({ id: "item_1" });
    expect(tx.department.update).toHaveBeenCalledWith({
      where: { id: "dept_1" },
      data: { totalTasks: { increment: 1 } },
    });
  });

  it("claims the oldest pending item atomically", async () => {
    tx.departmentBacklogItem.findFirst.mockResolvedValue({ id: "item_1" });
    tx.departmentBacklogItem.updateMany.mockResolvedValue({ count: 1 });
    tx.departmentBacklogItem.findUnique.mockResolvedValue({ id: "item_1", status: "CLAIMED" });
    await expect(claimNextPending("dept_1")).resolves.toMatchObject({ status: "CLAIMED" });
  });

  it("returns null when no pending item exists", async () => {
    tx.departmentBacklogItem.findFirst.mockResolvedValue(null);
    await expect(claimNextPending("dept_1")).resolves.toBeNull();
  });

  it("returns null when claim race is lost", async () => {
    tx.departmentBacklogItem.findFirst.mockResolvedValue({ id: "item_1" });
    tx.departmentBacklogItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(claimNextPending("dept_1")).resolves.toBeNull();
  });

  it("marks an item running", async () => {
    await markRunning("item_1");
    expect(mockPrisma.departmentBacklogItem.update).toHaveBeenCalledWith({
      where: { id: "item_1" },
      data: { status: "RUNNING" },
    });
  });

  it("marks an item done with result", async () => {
    await markDone("item_1", { ok: true });
    expect(mockPrisma.departmentBacklogItem.update).toHaveBeenCalledWith({
      where: { id: "item_1" },
      data: expect.objectContaining({ status: "DONE", result: { ok: true }, error: null }),
    });
  });

  it("marks an item as needing approval", async () => {
    await markNeedsApproval("item_1", { response: "draft" });
    expect(mockPrisma.departmentBacklogItem.update).toHaveBeenCalledWith({
      where: { id: "item_1" },
      data: { status: "NEEDS_APPROVAL", approvalDraft: { response: "draft" } },
    });
  });

  it("marks an item failed", async () => {
    await markFailed("item_1", "boom");
    expect(mockPrisma.departmentBacklogItem.update).toHaveBeenCalledWith({
      where: { id: "item_1" },
      data: expect.objectContaining({ status: "FAILED", error: "boom" }),
    });
  });
});
