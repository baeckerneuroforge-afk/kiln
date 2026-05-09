import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  department: { findUnique: vi.fn() },
}));

const mockSendSlack = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/departments/notifications/slack-notifier", () => ({
  sendSlackApprovalNotification: mockSendSlack,
  buildApprovalSlackText: vi.fn(),
}));
vi.mock("@/lib/departments/notifications/email-notifier", () => ({
  sendApprovalEmail: mockSendEmail,
  parseEmailRecipients: (value: string | null | undefined) =>
    typeof value === "string" && value.trim() ? value.split(",").map((v) => v.trim()) : [],
}));

import { dispatchSlaEscalation } from "@/lib/sla/notifications";

describe("sla notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_a",
      name: "Notdienst",
      userId: "user_a",
      orgId: "org_a",
      notifySlackChannel: "#sla",
      notifyEmailRecipients: "ops@example.com",
    });
    mockSendSlack.mockResolvedValue({ ok: true });
    mockSendEmail.mockResolvedValue({ ok: true, blocked: false });
  });

  it("sends both Slack and Email when escalationChannel=BOTH", async () => {
    const result = await dispatchSlaEscalation({
      trackingId: "t_1",
      policyId: "p_1",
      departmentId: "dept_a",
      orgId: "org_a",
      type: "BREACHED",
      elapsedMinutes: 90,
      targetMinutes: 60,
      thresholdMinutes: 45,
      escalationChannel: "BOTH",
      escalationTargetUserId: null,
    });
    expect(result.notified).toBe(true);
    expect(result.via).toEqual(expect.arrayContaining(["slack", "email"]));
    expect(mockSendSlack).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it("sends only Slack when escalationChannel=SLACK", async () => {
    await dispatchSlaEscalation({
      trackingId: "t_1",
      policyId: "p_1",
      departmentId: "dept_a",
      orgId: "org_a",
      type: "WARNING",
      elapsedMinutes: 50,
      targetMinutes: 60,
      thresholdMinutes: 45,
      escalationChannel: "SLACK",
      escalationTargetUserId: null,
    });
    expect(mockSendSlack).toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns notified=false when department is missing", async () => {
    mockPrisma.department.findUnique.mockResolvedValueOnce(null);
    const result = await dispatchSlaEscalation({
      trackingId: "t_1",
      policyId: "p_1",
      departmentId: "missing",
      orgId: "org_a",
      type: "BREACHED",
      elapsedMinutes: 100,
      targetMinutes: 60,
      thresholdMinutes: 45,
      escalationChannel: "BOTH",
      escalationTargetUserId: null,
    });
    expect(result.notified).toBe(false);
    expect(result.errors).toContain("department-not-found");
  });
});
