import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  department: { findUnique: vi.fn() },
  departmentRunLog: { create: vi.fn() },
}));

const slackMock = vi.hoisted(() => vi.fn());
const emailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/departments/notifications/slack-notifier", () => ({
  sendSlackApprovalNotification: slackMock,
  buildApprovalSlackText: vi.fn(() => "slack text"),
}));
vi.mock("@/lib/departments/notifications/email-notifier", () => ({
  sendApprovalEmail: emailMock,
  parseEmailRecipients: (value: string | null | undefined) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.includes("@"))
      : [],
}));

import { notifyApprovalNeeded } from "@/lib/departments/notifications/notification-router";

const baseDepartment = {
  id: "dept_1",
  name: "Customer Support",
  userId: "user_1",
  orgId: "org_1",
  notifyOnApprovalNeeded: true,
  notifyChannel: "SLACK_THEN_EMAIL",
  notifySlackChannel: "#support",
  notifyEmailRecipients: "owner@example.com,backup@example.com",
  notifyDigestEnabled: false,
};

describe("notifyApprovalNeeded — channel routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    slackMock.mockResolvedValue({ ok: true, ts: "1.1" });
    emailMock.mockResolvedValue({ ok: true, externalId: "email_1" });
    mockPrisma.department.findUnique.mockResolvedValue(baseDepartment);
  });

  it("sends both Slack and email when channel is SLACK_THEN_EMAIL", async () => {
    const result = await notifyApprovalNeeded({
      departmentId: "dept_1",
      backlogItemId: "item_1",
      draftedAction: { body: "hello" },
      channel: "EMAIL",
    });
    expect(slackMock).toHaveBeenCalledTimes(1);
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ notified: true, via: ["slack", "email"] });
  });

  it("only sends Slack when channel is SLACK_ONLY", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      ...baseDepartment,
      notifyChannel: "SLACK_ONLY",
    });
    const result = await notifyApprovalNeeded({
      departmentId: "dept_1",
      backlogItemId: "item_1",
      draftedAction: { body: "hi" },
      channel: "WHATSAPP",
    });
    expect(slackMock).toHaveBeenCalledTimes(1);
    expect(emailMock).not.toHaveBeenCalled();
    expect(result.via).toEqual(["slack"]);
  });

  it("only sends Email when channel is EMAIL_ONLY", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      ...baseDepartment,
      notifyChannel: "EMAIL_ONLY",
    });
    const result = await notifyApprovalNeeded({
      departmentId: "dept_1",
      backlogItemId: "item_1",
      draftedAction: { body: "hi" },
      channel: "EMAIL",
    });
    expect(slackMock).not.toHaveBeenCalled();
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(result.via).toEqual(["email"]);
  });

  it("skips when channel is NONE", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      ...baseDepartment,
      notifyChannel: "NONE",
    });
    const result = await notifyApprovalNeeded({
      departmentId: "dept_1",
      backlogItemId: "item_1",
      draftedAction: {},
      channel: "INTERNAL",
    });
    expect(slackMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: false, via: [] });
  });

  it("skips when notifyOnApprovalNeeded is false", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      ...baseDepartment,
      notifyOnApprovalNeeded: false,
    });
    const result = await notifyApprovalNeeded({
      departmentId: "dept_1",
      backlogItemId: "item_1",
      draftedAction: {},
      channel: "INTERNAL",
    });
    expect(result).toEqual({ notified: false, via: [] });
  });

  it("queues for digest when digest mode enabled", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      ...baseDepartment,
      notifyDigestEnabled: true,
    });
    const result = await notifyApprovalNeeded({
      departmentId: "dept_1",
      backlogItemId: "item_1",
      draftedAction: { body: "hi" },
      channel: "EMAIL",
    });
    expect(slackMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: false, via: ["digest-queued"] });
  });

  it("returns gracefully when department not found", async () => {
    mockPrisma.department.findUnique.mockResolvedValue(null);
    const result = await notifyApprovalNeeded({
      departmentId: "nope",
      backlogItemId: "item_1",
      draftedAction: {},
      channel: "INTERNAL",
    });
    expect(result).toEqual({ notified: false, via: [] });
  });

  it("does not include slack when slack channel is missing", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({
      ...baseDepartment,
      notifySlackChannel: null,
    });
    const result = await notifyApprovalNeeded({
      departmentId: "dept_1",
      backlogItemId: "item_1",
      draftedAction: { body: "hi" },
      channel: "EMAIL",
    });
    expect(slackMock).not.toHaveBeenCalled();
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(result.via).toEqual(["email"]);
  });

  it("logs failed slack send but continues to email", async () => {
    slackMock.mockResolvedValue({ ok: false, error: "channel_not_found" });
    const result = await notifyApprovalNeeded({
      departmentId: "dept_1",
      backlogItemId: "item_1",
      draftedAction: { body: "hi" },
      channel: "EMAIL",
    });
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(result.via).toContain("email");
    expect(result.via).not.toContain("slack");
  });

  it("records BLOCKED when email is autosend-blocked", async () => {
    emailMock.mockResolvedValue({
      ok: false,
      blocked: true,
      blockedReason: "DEPARTMENT_BLOCK_AUTO_SEND=true",
    });
    const result = await notifyApprovalNeeded({
      departmentId: "dept_1",
      backlogItemId: "item_1",
      draftedAction: { body: "hi" },
      channel: "EMAIL",
    });
    expect(result.via).toContain("email-blocked");
    expect(result.via).not.toContain("email");
  });
});
