import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  departmentBacklogItem: { findUnique: vi.fn(), update: vi.fn() },
  department: { update: vi.fn() },
  departmentRunLog: { create: vi.fn() },
  $transaction: vi.fn().mockResolvedValue([]),
}));
const invokeDraftedActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/departments/invocation", () => ({
  invokeDraftedAction: invokeDraftedActionMock,
}));
vi.mock("@/lib/departments/channels/logging", () => ({
  logDepartmentChannelEvent: vi.fn(),
}));

import { approveItem, rejectItem } from "@/lib/departments/approval-gate";

describe("approval-gate defense-in-depth scope check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeDraftedActionMock.mockResolvedValue({ ok: true, durationMs: 10 });
  });

  it("approveItem rejects when scope is provided and item belongs to different org", async () => {
    mockPrisma.departmentBacklogItem.findUnique.mockResolvedValue({
      id: "item_1",
      status: "NEEDS_APPROVAL",
      departmentId: "dept_y",
      department: { id: "dept_y", orgId: "org_y", userId: "user_y" },
      approvalDraft: {},
    });

    await expect(
      approveItem("item_1", "user_x", { userId: "user_x", orgId: "org_x" })
    ).rejects.toThrow("Approval item not found or not awaiting approval");
    expect(invokeDraftedActionMock).not.toHaveBeenCalled();
  });

  it("approveItem proceeds when scope matches item's org", async () => {
    mockPrisma.departmentBacklogItem.findUnique.mockResolvedValue({
      id: "item_1",
      status: "NEEDS_APPROVAL",
      departmentId: "dept_x",
      department: { id: "dept_x", orgId: "org_x", userId: "user_x" },
      approvalDraft: {},
    });

    await approveItem("item_1", "user_x", { userId: "user_x", orgId: "org_x" });
    expect(invokeDraftedActionMock).toHaveBeenCalled();
  });

  it("approveItem proceeds for legacy null-org items owned by scope user", async () => {
    mockPrisma.departmentBacklogItem.findUnique.mockResolvedValue({
      id: "item_1",
      status: "NEEDS_APPROVAL",
      departmentId: "dept_legacy",
      department: { id: "dept_legacy", orgId: null, userId: "user_x" },
      approvalDraft: {},
    });

    await approveItem("item_1", "user_x", { userId: "user_x", orgId: "org_x" });
    expect(invokeDraftedActionMock).toHaveBeenCalled();
  });

  it("approveItem still works when scope is omitted (backward-compat)", async () => {
    mockPrisma.departmentBacklogItem.findUnique.mockResolvedValue({
      id: "item_1",
      status: "NEEDS_APPROVAL",
      departmentId: "dept_y",
      department: { id: "dept_y", orgId: "org_y", userId: "user_y" },
      approvalDraft: {},
    });

    await approveItem("item_1", "user_x");
    expect(invokeDraftedActionMock).toHaveBeenCalled();
  });

  it("rejectItem rejects when scope is provided and item belongs to different org", async () => {
    mockPrisma.departmentBacklogItem.findUnique.mockResolvedValue({
      status: "NEEDS_APPROVAL",
      departmentId: "dept_y",
      department: { orgId: "org_y", userId: "user_y" },
    });

    await expect(
      rejectItem("item_1", "user_x", "no thanks", { userId: "user_x", orgId: "org_x" })
    ).rejects.toThrow("Approval item not found or not awaiting approval");
    expect(mockPrisma.departmentBacklogItem.update).not.toHaveBeenCalled();
  });
});
