import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  department: { findUnique: vi.fn() },
  departmentChannelMessage: { create: vi.fn() },
  departmentRunLog: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("resend", () => ({
  Resend: class Resend {
    emails = { send: sendMock };
  },
}));

import { sendDepartmentEmail } from "@/lib/departments/channels/email-sender";

describe("sendDepartmentEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "true";
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_1",
      emailFromAddr: "support@example.com",
      emailFromName: "Support",
      emailReplyToAddr: null,
    });
  });

  it("blocks outbound when safety lock is on", async () => {
    await expect(sendDepartmentEmail(baseArgs())).resolves.toMatchObject({
      sent: false,
      blockedReason: "DEPARTMENT_BLOCK_AUTO_SEND=true",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("records blocked outbound channel message", async () => {
    await sendDepartmentEmail(baseArgs());
    expect(mockPrisma.departmentChannelMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "BLOCKED", channel: "EMAIL" }),
    });
  });

  it("sends with Resend when safety lock is off", async () => {
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "false";
    sendMock.mockResolvedValue({ data: { id: "email_1" } });
    await expect(sendDepartmentEmail(baseArgs())).resolves.toMatchObject({
      sent: true,
      externalId: "email_1",
    });
  });

  it("records failed outbound on Resend error", async () => {
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "false";
    sendMock.mockRejectedValue(new Error("resend down"));
    await expect(sendDepartmentEmail(baseArgs())).rejects.toThrow("resend down");
    expect(mockPrisma.departmentChannelMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "FAILED", errorMessage: "resend down" }),
    });
  });
});

function baseArgs() {
  return {
    departmentId: "dept_1",
    backlogItemId: "item_1",
    to: "customer@example.com",
    subject: "Re: Help",
    body: "Hello",
    approverUserId: "user_1",
  };
}
