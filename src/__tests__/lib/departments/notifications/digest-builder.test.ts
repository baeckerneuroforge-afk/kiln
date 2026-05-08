import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  department: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  departmentBacklogItem: {
    findMany: vi.fn(),
  },
  departmentRunLog: { create: vi.fn() },
}));
const sendMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("resend", () => ({
  Resend: class Resend {
    emails = { send: sendMock };
  },
}));

import { runDailyApprovalDigest } from "@/lib/departments/notifications/digest-builder";

describe("digest-builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "false";
    process.env.RESEND_API_KEY = "test_key";
    process.env.NEXT_PUBLIC_APP_URL = "https://kiln.test";
  });

  it("processes only departments with digest enabled and email recipients", async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      {
        id: "dept_1",
        name: "Customer Support",
        notifyChannel: "EMAIL_ONLY",
        notifyEmailRecipients: "owner@example.com",
        notifyDigestSentAt: new Date("2026-05-07T08:00:00Z"),
      },
    ]);
    mockPrisma.departmentBacklogItem.findMany.mockResolvedValue([
      {
        id: "item_1",
        approvalDraft: { subject: "Password reset", body: "Help here" },
        triggerPayload: { channel: "EMAIL", from: "user@example.com" },
        createdAt: new Date("2026-05-08T10:00:00Z"),
      },
    ]);
    sendMock.mockResolvedValue({ data: { id: "digest_1" } });

    const result = await runDailyApprovalDigest();
    expect(mockPrisma.departmentBacklogItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "NEEDS_APPROVAL",
          createdAt: { gt: new Date("2026-05-07T08:00:00Z") },
        }),
      })
    );
    expect(sendMock).toHaveBeenCalledOnce();
    expect(mockPrisma.department.update).toHaveBeenCalledWith({
      where: { id: "dept_1" },
      data: { notifyDigestSentAt: expect.any(Date) },
    });
    expect(result.digestsSent).toBe(1);
  });

  it("skips departments with no pending items", async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      {
        id: "dept_1",
        name: "Customer Support",
        notifyChannel: "EMAIL_ONLY",
        notifyEmailRecipients: "owner@example.com",
        notifyDigestSentAt: null,
      },
    ]);
    mockPrisma.departmentBacklogItem.findMany.mockResolvedValue([]);
    const result = await runDailyApprovalDigest();
    expect(sendMock).not.toHaveBeenCalled();
    expect(result.digestsSent).toBe(0);
  });

  it("skips SLACK_ONLY departments (digest is email-only)", async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      {
        id: "dept_1",
        name: "Customer Support",
        notifyChannel: "SLACK_ONLY",
        notifyEmailRecipients: "owner@example.com",
        notifyDigestSentAt: null,
      },
    ]);
    const result = await runDailyApprovalDigest();
    expect(mockPrisma.departmentBacklogItem.findMany).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(result.digestsSent).toBe(0);
  });

  it("blocks send when DEPARTMENT_BLOCK_AUTO_SEND=true", async () => {
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "true";
    mockPrisma.department.findMany.mockResolvedValue([
      {
        id: "dept_1",
        name: "Customer Support",
        notifyChannel: "SLACK_THEN_EMAIL",
        notifyEmailRecipients: "owner@example.com",
        notifyDigestSentAt: null,
      },
    ]);
    mockPrisma.departmentBacklogItem.findMany.mockResolvedValue([
      {
        id: "item_1",
        approvalDraft: { body: "Hi" },
        triggerPayload: {},
        createdAt: new Date(),
      },
    ]);
    const result = await runDailyApprovalDigest();
    expect(sendMock).not.toHaveBeenCalled();
    expect(result.digestsBlocked).toBe(1);
    expect(mockPrisma.department.update).not.toHaveBeenCalled();
  });
});
