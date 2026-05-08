import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  department: { findUnique: vi.fn() },
  departmentChannelMessage: { findFirst: vi.fn(), create: vi.fn() },
  departmentRunLog: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  checkWhatsappWindow,
  sendDepartmentWhatsapp,
} from "@/lib/departments/channels/whatsapp-sender";

describe("sendDepartmentWhatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "true";
    mockPrisma.department.findUnique.mockResolvedValue({ whatsappPhoneId: "phone_1" });
    mockPrisma.departmentChannelMessage.findFirst.mockResolvedValue({ createdAt: new Date() });
  });

  it("allows WhatsApp sends inside the 24h window", async () => {
    await expect(checkWhatsappWindow("dept_1", "4917")).resolves.toEqual({ allowed: true });
  });

  it("blocks WhatsApp sends outside the 24h window", async () => {
    mockPrisma.departmentChannelMessage.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    await expect(checkWhatsappWindow("dept_1", "4917")).resolves.toMatchObject({
      allowed: false,
    });
  });

  it("blocks outbound when safety lock is on", async () => {
    await expect(sendDepartmentWhatsapp(baseArgs())).resolves.toMatchObject({
      sent: false,
      blockedReason: "DEPARTMENT_BLOCK_AUTO_SEND=true",
    });
  });

  it("records blocked outbound channel message", async () => {
    await sendDepartmentWhatsapp(baseArgs());
    expect(mockPrisma.departmentChannelMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "BLOCKED", channel: "WHATSAPP" }),
    });
  });

  it("sends through Meta when safety lock is off", async () => {
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "false";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid_1" }] }), { status: 200 })));
    await expect(sendDepartmentWhatsapp(baseArgs())).resolves.toMatchObject({
      sent: true,
      externalId: "wamid_1",
    });
    vi.unstubAllGlobals();
  });

  it("records failed outbound on Meta error", async () => {
    process.env.DEPARTMENT_BLOCK_AUTO_SEND = "false";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "meta down" } }), { status: 500 })));
    await expect(sendDepartmentWhatsapp(baseArgs())).rejects.toThrow("meta down");
    expect(mockPrisma.departmentChannelMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "FAILED", errorMessage: "meta down" }),
    });
    vi.unstubAllGlobals();
  });
});

function baseArgs() {
  return {
    departmentId: "dept_1",
    backlogItemId: "item_1",
    to: "491701234567",
    body: "Hello",
    approverUserId: "user_1",
  };
}
