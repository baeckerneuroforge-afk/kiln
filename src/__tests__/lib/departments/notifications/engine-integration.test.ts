import { beforeEach, describe, expect, it, vi } from "vitest";

// Engine integration test: notification failure must NOT crash the manager loop.
// We verify by ensuring runManagerLoop completes when notify throws.

const mockPrisma = vi.hoisted(() => ({
  department: { findUnique: vi.fn() },
  departmentBacklogItem: {
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  departmentRunLog: { create: vi.fn() },
}));

const notifyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/departments/notifications/notification-router", () => ({
  notifyApprovalNeeded: notifyMock,
}));
vi.mock("@/lib/departments/backlog", () => ({
  claimNextPending: vi.fn(),
  enqueueTask: vi.fn(),
  markDone: vi.fn(),
  markFailed: vi.fn(),
  markNeedsApproval: vi.fn(),
  markRunning: vi.fn(),
}));
vi.mock("@/lib/departments/manager-loop", () => ({
  decideNextAction: vi.fn(),
}));
vi.mock("@/lib/departments/operating-memory", () => ({
  patchMemory: vi.fn(),
  readMemory: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/departments/invocation", () => ({
  invokeWorker: vi.fn(),
  invokeWorkflow: vi.fn(),
  invokeSwarm: vi.fn(),
}));
vi.mock("@/lib/departments/approval-gate", () => ({
  approveItem: vi.fn(),
  rejectItem: vi.fn(),
}));

import { triggerDepartment } from "@/lib/departments/department-engine";
import { decideNextAction } from "@/lib/departments/manager-loop";
import {
  claimNextPending,
  markNeedsApproval,
  markRunning,
} from "@/lib/departments/backlog";

describe("manager loop notification integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_1",
      status: "ACTIVE",
      orgId: "org_1",
      userId: "user_1",
      approvalMode: "APPROVAL_FIRST",
      workerAgents: [],
      runLogs: [],
    });

    mockPrisma.departmentBacklogItem.count.mockResolvedValue(0);
    mockPrisma.departmentBacklogItem.findUnique.mockResolvedValue({
      id: "item_1",
      departmentId: "dept_1",
      status: "RUNNING",
      triggerPayload: { channel: "EMAIL", from: "user@example.com" },
    });
    mockPrisma.departmentBacklogItem.update.mockResolvedValue({ id: "item_1" });
    mockPrisma.departmentRunLog.create.mockResolvedValue({});

    vi.mocked(claimNextPending).mockResolvedValueOnce({ id: "item_1" } as never);
    vi.mocked(claimNextPending).mockResolvedValue(null as never);
    vi.mocked(markRunning).mockResolvedValue(undefined);
    vi.mocked(markNeedsApproval).mockResolvedValue(undefined);

    vi.mocked(decideNextAction).mockResolvedValue({
      decision: {
        type: "REQUEST_APPROVAL",
        draftedAction: { body: "Drafted reply", subject: "Re: help" },
      },
      tokensUsed: 0,
      raw: {},
    });
  });

  it("calls notifyApprovalNeeded with draft + channel when item moves to NEEDS_APPROVAL", async () => {
    notifyMock.mockResolvedValue({ notified: true, via: ["slack"] });

    await triggerDepartment("dept_1", {
      triggerType: "MANUAL",
      payload: { source: "test" },
    });

    expect(markNeedsApproval).toHaveBeenCalledWith(
      "item_1",
      expect.objectContaining({ body: "Drafted reply" })
    );
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: "dept_1",
        backlogItemId: "item_1",
        channel: "EMAIL",
        draftedAction: expect.objectContaining({ body: "Drafted reply" }),
      })
    );
  });

  it("does not crash the loop when notify throws", async () => {
    notifyMock.mockRejectedValue(new Error("slack down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      triggerDepartment("dept_1", {
        triggerType: "MANUAL",
        payload: { source: "test" },
      })
    ).resolves.toBeUndefined();

    expect(markNeedsApproval).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
