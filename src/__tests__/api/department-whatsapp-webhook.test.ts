import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPrisma = vi.hoisted(() => ({
  department: { findUnique: vi.fn() },
  departmentChannelMessage: { create: vi.fn(), update: vi.fn() },
  departmentRunLog: { create: vi.fn() },
}));
const enqueueTask = vi.hoisted(() => vi.fn());
const runManagerLoop = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/departments/backlog", () => ({ enqueueTask }));
vi.mock("@/lib/departments/department-engine", () => ({ runManagerLoop }));
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => promise }));

import { GET, POST } from "@/app/api/webhooks/department-whatsapp/[departmentId]/route";

describe("department whatsapp webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.META_APP_SECRET = "secret";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify";
    delete process.env.DEPARTMENT_INBOUND_ALLOWLIST;
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_1",
      whatsappEnabled: true,
      status: "ACTIVE",
    });
    mockPrisma.departmentChannelMessage.create.mockResolvedValue({ id: "msg_1" });
    enqueueTask.mockResolvedValue({ id: "item_1" });
  });

  it("verifies Meta challenge", async () => {
    const response = await GET(new NextRequest("https://x.test?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=abc"));
    expect(await response.text()).toBe("abc");
  });

  it("rejects invalid verify token", async () => {
    const response = await GET(new NextRequest("https://x.test?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=abc"));
    expect(response.status).toBe(403);
  });

  it("rejects invalid signature", async () => {
    const response = await POST(new NextRequest("https://x.test", { method: "POST", body: "{}" }), {
      params: { departmentId: "dept_1" },
    });
    expect(response.status).toBe(401);
  });

  it("creates channel message for signed inbound text", async () => {
    const body = JSON.stringify(metaPayload());
    const response = await POST(
      new NextRequest("https://x.test", {
        method: "POST",
        body,
        headers: { "x-hub-signature-256": sign(body) },
      }),
      { params: { departmentId: "dept_1" } }
    );
    expect(response.status).toBe(200);
    expect(mockPrisma.departmentChannelMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: "WHATSAPP", whatsappFrom: "491701234567" }),
    });
  });

  it("drops non-allowlisted whatsapp sender", async () => {
    process.env.DEPARTMENT_INBOUND_ALLOWLIST = "491700000000";
    const body = JSON.stringify(metaPayload());
    await POST(
      new NextRequest("https://x.test", {
        method: "POST",
        body,
        headers: { "x-hub-signature-256": sign(body) },
      }),
      { params: { departmentId: "dept_1" } }
    );
    expect(enqueueTask).not.toHaveBeenCalled();
  });
});

function sign(body: string) {
  return `sha256=${crypto.createHmac("sha256", "secret").update(body).digest("hex")}`;
}

function metaPayload() {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "phone_1" },
              messages: [
                {
                  from: "491701234567",
                  id: "wamid_1",
                  type: "text",
                  text: { body: "Hello" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
