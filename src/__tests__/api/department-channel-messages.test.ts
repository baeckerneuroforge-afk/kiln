import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPrisma = vi.hoisted(() => ({
  department: { findFirst: vi.fn() },
  departmentChannelMessage: { findMany: vi.fn(), findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/org-context", () => ({
  requireOrgId: vi.fn(async () => ({ userId: "user_1", orgId: "org_1" })),
  OrgContextError: class OrgContextError extends Error {},
}));
vi.mock("@/lib/auth/org-scope", () => ({
  orgScopeFilter: () => ({ OR: [{ orgId: "org_1" }, { userId: "user_1", orgId: null }] }),
}));

import { GET as listMessages } from "@/app/api/departments/[id]/channel-messages/route";
import { GET as getMessage } from "@/app/api/departments/[id]/channel-messages/[msgId]/route";

describe("department channel messages API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.department.findFirst.mockResolvedValue({ id: "dept_1" });
    mockPrisma.departmentChannelMessage.findMany.mockResolvedValue([{ id: "msg_1" }]);
    mockPrisma.departmentChannelMessage.findFirst.mockResolvedValue({ id: "msg_1" });
  });

  it("lists channel messages", async () => {
    const response = await listMessages(new NextRequest("https://x.test/api/departments/dept_1/channel-messages"), {
      params: { id: "dept_1" },
    });
    expect(await response.json()).toEqual([{ id: "msg_1" }]);
  });

  it("applies channel and direction filters", async () => {
    await listMessages(new NextRequest("https://x.test/api/departments/dept_1/channel-messages?channel=EMAIL&direction=OUTBOUND"), {
      params: { id: "dept_1" },
    });
    expect(mockPrisma.departmentChannelMessage.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ channel: "EMAIL", direction: "OUTBOUND" }),
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  it("loads message detail with backlog item", async () => {
    const response = await getMessage(new NextRequest("https://x.test"), {
      params: { id: "dept_1", msgId: "msg_1" },
    });
    expect(response.status).toBe(200);
    expect(mockPrisma.departmentChannelMessage.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "msg_1", departmentId: "dept_1" }),
      include: { backlogItem: true },
    });
  });
});
