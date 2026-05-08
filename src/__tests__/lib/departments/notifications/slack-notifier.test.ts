import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  integrationConnection: { findUnique: vi.fn() },
}));
const decryptMock = vi.hoisted(() => vi.fn());
const sendSlackMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/encryption", () => ({ decrypt: decryptMock }));
vi.mock("@/lib/integrations/slack", () => ({
  sendSlackMessage: sendSlackMock,
}));

import {
  sendSlackApprovalNotification,
  buildApprovalSlackText,
} from "@/lib/departments/notifications/slack-notifier";

describe("slack-notifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no_slack_integration when connection missing", async () => {
    mockPrisma.integrationConnection.findUnique.mockResolvedValue(null);
    const result = await sendSlackApprovalNotification({
      userId: "u1",
      orgId: "o1",
      slackChannel: "#support",
      text: "hello",
    });
    expect(result).toEqual({ ok: false, error: "no_slack_integration" });
    expect(sendSlackMock).not.toHaveBeenCalled();
  });

  it("returns missing_access_token when decrypted config has none", async () => {
    mockPrisma.integrationConnection.findUnique.mockResolvedValue({
      isActive: true,
      config: "encrypted",
    });
    decryptMock.mockReturnValue(JSON.stringify({}));
    const result = await sendSlackApprovalNotification({
      userId: "u1",
      orgId: "o1",
      slackChannel: "#support",
      text: "hello",
    });
    expect(result).toEqual({ ok: false, error: "missing_access_token" });
  });

  it("calls sendSlackMessage with token and channel", async () => {
    mockPrisma.integrationConnection.findUnique.mockResolvedValue({
      isActive: true,
      config: "encrypted",
    });
    decryptMock.mockReturnValue(JSON.stringify({ accessToken: "xoxb-test" }));
    sendSlackMock.mockResolvedValue({ ok: true, ts: "1.1" });

    const result = await sendSlackApprovalNotification({
      userId: "u1",
      orgId: "o1",
      slackChannel: "#support",
      text: "hello",
    });
    expect(sendSlackMock).toHaveBeenCalledWith("xoxb-test", "#support", "hello");
    expect(result).toEqual({ ok: true, ts: "1.1" });
  });

  it("returns error when slack API responds with not_ok", async () => {
    mockPrisma.integrationConnection.findUnique.mockResolvedValue({
      isActive: true,
      config: "encrypted",
    });
    decryptMock.mockReturnValue(JSON.stringify({ accessToken: "xoxb-test" }));
    sendSlackMock.mockResolvedValue({ ok: false, error: "channel_not_found" });

    const result = await sendSlackApprovalNotification({
      userId: "u1",
      orgId: "o1",
      slackChannel: "#missing",
      text: "hello",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("channel_not_found");
  });

  it("formats approval text with department, channel, preview", () => {
    const text = buildApprovalSlackText({
      departmentName: "Customer Support",
      channel: "WHATSAPP",
      from: "+491701234567",
      subject: "Password help",
      preview: "Hi! Here you go.",
      approvalUrl: "https://kiln.example/approve",
    });
    expect(text).toContain("Customer Support");
    expect(text).toContain("WHATSAPP");
    expect(text).toContain("+491701234567");
    expect(text).toContain("Password help");
    expect(text).toContain("Hi! Here you go.");
    expect(text).toContain("https://kiln.example/approve");
  });
});
