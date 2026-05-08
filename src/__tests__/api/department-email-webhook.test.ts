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

import { POST } from "@/app/api/webhooks/department-email/[departmentId]/route";

describe("department email webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DEPARTMENT_INBOUND_ALLOWLIST;
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept_1",
      emailEnabled: true,
      status: "ACTIVE",
    });
    mockPrisma.departmentChannelMessage.create.mockResolvedValue({ id: "msg_1" });
    enqueueTask.mockResolvedValue({ id: "item_1" });
  });

  it("creates inbound channel message", async () => {
    const response = await POST(request({ from: "a@example.com", text: "Help" }), {
      params: { departmentId: "dept_1" },
    });
    expect(response.status).toBe(200);
    expect(mockPrisma.departmentChannelMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: "EMAIL", direction: "INBOUND" }),
    });
  });

  it("creates backlog item linked to channel message", async () => {
    await POST(request({ from: "a@example.com", text: "Help" }), {
      params: { departmentId: "dept_1" },
    });
    expect(enqueueTask).toHaveBeenCalledWith({
      departmentId: "dept_1",
      triggerType: "WEBHOOK",
      triggerPayload: expect.objectContaining({ channelMessageId: "msg_1" }),
    });
    expect(mockPrisma.departmentChannelMessage.update).toHaveBeenCalledWith({
      where: { id: "msg_1" },
      data: { backlogItemId: "item_1" },
    });
  });

  it("drops non-allowlisted inbound silently", async () => {
    process.env.DEPARTMENT_INBOUND_ALLOWLIST = "allowed@example.com";
    const response = await POST(request({ from: "blocked@example.com", text: "Help" }), {
      params: { departmentId: "dept_1" },
    });
    expect(response.status).toBe(200);
    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it("ignores disabled departments", async () => {
    mockPrisma.department.findUnique.mockResolvedValue({ id: "dept_1", emailEnabled: false });
    await POST(request({ from: "a@example.com", text: "Help" }), {
      params: { departmentId: "dept_1" },
    });
    expect(enqueueTask).not.toHaveBeenCalled();
  });
});

function request(payload: Record<string, unknown>) {
  return new NextRequest("https://kilnbase.com/api/webhooks/department-email/dept_1", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
