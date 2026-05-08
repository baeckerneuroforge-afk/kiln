import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class Resend {
    emails = { send: sendMock };
  },
}));

import {
  sendApprovalEmail,
  buildApprovalEmailText,
  parseEmailRecipients,
} from "@/lib/departments/notifications/email-notifier";

const baseArgs = () => ({
  departmentName: "Customer Support",
  recipients: ["owner@example.com"],
  channel: "EMAIL",
  fromIdentity: "customer@example.com",
  subject: "Password reset",
  preview: "Hi! Here is the link.",
  approvalUrl: "https://kilnbase.com/dashboard/departments/dept_1/approvals?item=item_1",
});

describe("email-notifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "false";
    process.env.RESEND_API_KEY = "test_key";
    process.env.DEPARTMENT_NOTIFICATION_FROM = "KILN <noreply@kiln.test>";
  });

  it("returns no_recipients when recipients list is empty", async () => {
    const result = await sendApprovalEmail({ ...baseArgs(), recipients: [] });
    expect(result).toEqual({ ok: false, error: "no_recipients" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("blocks send when DEPARTMENT_BLOCK_AUTO_SEND=true", async () => {
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "true";
    const result = await sendApprovalEmail(baseArgs());
    expect(result.blocked).toBe(true);
    expect(result.ok).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends via Resend when not blocked", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_xyz" } });
    const result = await sendApprovalEmail(baseArgs());
    expect(result).toEqual({ ok: true, externalId: "email_xyz" });
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("includes preview content in plain text body", () => {
    const text = buildApprovalEmailText(baseArgs());
    expect(text).toContain("Customer Support");
    expect(text).toContain("Hi! Here is the link.");
    expect(text).toContain("https://kilnbase.com");
  });

  it("parses comma-separated recipients", () => {
    const list = parseEmailRecipients("a@x.com, b@y.com ,not-an-email,c@z.com");
    expect(list).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
  });

  it("parses null recipients to empty array", () => {
    expect(parseEmailRecipients(null)).toEqual([]);
    expect(parseEmailRecipients(undefined)).toEqual([]);
    expect(parseEmailRecipients("")).toEqual([]);
  });
});
