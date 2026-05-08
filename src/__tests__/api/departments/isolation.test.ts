import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPrisma = vi.hoisted(() => ({
  department: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  departmentBacklogItem: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  departmentChannelMessage: { findFirst: vi.fn(), findMany: vi.fn() },
  knowledgeBase: { findFirst: vi.fn() },
}));

const requireOrgIdMock = vi.hoisted(() => vi.fn());
const triggerDepartmentMock = vi.hoisted(() => vi.fn());
const approveBacklogMock = vi.hoisted(() => vi.fn());
const handleWebhookTriggerMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/org-context", () => ({
  requireOrgId: requireOrgIdMock,
  OrgContextError: class OrgContextError extends Error {},
}));
vi.mock("@/lib/departments/department-engine", () => ({
  triggerDepartment: triggerDepartmentMock,
  approveBacklogItem: approveBacklogMock,
  rejectBacklogItem: vi.fn(),
}));
vi.mock("@/lib/departments/trigger-system", () => ({
  handleWebhookTrigger: handleWebhookTriggerMock,
}));

import { GET as getDepartment, PATCH as patchDepartment } from "@/app/api/departments/[id]/route";
import { POST as runDepartment } from "@/app/api/departments/[id]/run/route";
import { POST as approveItem } from "@/app/api/departments/[id]/approve/[itemId]/route";
import { POST as triggerWebhook } from "@/app/api/departments/[id]/trigger/route";
import { GET as listChannelMessages } from "@/app/api/departments/[id]/channel-messages/route";
import { GET as readMemoryRoute } from "@/app/api/departments/[id]/memory/route";
import { GET as listBacklog } from "@/app/api/departments/[id]/backlog/route";

const SCOPE_X = { userId: "user_x", orgId: "org_x" };
const SCOPE_Y = { userId: "user_y", orgId: "org_y" };

describe("Sub-Org Isolation — Departments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("User-A in Org-X cannot read Department of Org-Y via GET", async () => {
    requireOrgIdMock.mockResolvedValue(SCOPE_X);
    mockPrisma.department.findFirst.mockResolvedValue(null);
    const response = await getDepartment(
      new NextRequest("https://kiln.test/api/departments/dept_orgy"),
      { params: { id: "dept_orgy" } }
    );
    expect(response.status).toBe(404);
  });

  it("User-A in Sub-Org-X1 cannot trigger Department in Sub-Org-X2 via /run", async () => {
    requireOrgIdMock.mockResolvedValue(SCOPE_X);
    mockPrisma.department.findFirst.mockResolvedValue(null);
    const response = await runDepartment(
      new NextRequest("https://kiln.test/api/departments/dept_orgx2/run", {
        method: "POST",
        body: "{}",
      }),
      { params: { id: "dept_orgx2" } }
    );
    expect(response.status).toBe(404);
    expect(triggerDepartmentMock).not.toHaveBeenCalled();
  });

  it("User cannot approve backlog item from another org (404)", async () => {
    requireOrgIdMock.mockResolvedValue(SCOPE_X);
    mockPrisma.departmentBacklogItem.findFirst.mockResolvedValue(null);
    const response = await approveItem(
      new NextRequest("https://kiln.test/api/departments/dept_orgy/approve/item_orgy", {
        method: "POST",
        body: "{}",
      }),
      { params: { id: "dept_orgy", itemId: "item_orgy" } }
    );
    expect(response.status).toBe(404);
    expect(approveBacklogMock).not.toHaveBeenCalled();
  });

  it("Webhook trigger URL with wrong secret rejects payload (401)", async () => {
    handleWebhookTriggerMock.mockResolvedValue({
      queued: false,
      status: 401,
      error: "Unauthorized",
    });
    const response = await triggerWebhook(
      new NextRequest("https://kiln.test/api/departments/dept_xx/trigger", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "x-kiln-webhook-secret": "wrong" },
      }),
      { params: { id: "dept_xx" } }
    );
    expect(response.status).toBe(401);
    expect(handleWebhookTriggerMock).toHaveBeenCalledWith(
      expect.objectContaining({ secret: "wrong" })
    );
  });

  it("Department-A cannot read Department-B's operating memory (404)", async () => {
    requireOrgIdMock.mockResolvedValue(SCOPE_X);
    mockPrisma.department.findFirst.mockResolvedValue(null);
    const response = await readMemoryRoute(
      new NextRequest("https://kiln.test/api/departments/dept_orgy/memory"),
      { params: { id: "dept_orgy" } }
    );
    expect(response.status).toBe(404);
  });

  it("Channel-message list does NOT leak across orgs (404 when out of scope)", async () => {
    requireOrgIdMock.mockResolvedValue(SCOPE_X);
    mockPrisma.department.findFirst.mockResolvedValue(null);
    const response = await listChannelMessages(
      new NextRequest("https://kiln.test/api/departments/dept_orgy/channel-messages"),
      { params: { id: "dept_orgy" } }
    );
    expect(response.status).toBe(404);
    expect(mockPrisma.departmentChannelMessage.findMany).not.toHaveBeenCalled();
  });

  it("Approval-Queue (backlog) list does NOT include items from other orgs", async () => {
    requireOrgIdMock.mockResolvedValue(SCOPE_X);
    mockPrisma.department.findFirst.mockResolvedValue(null);
    const response = await listBacklog(
      new NextRequest("https://kiln.test/api/departments/dept_orgy/backlog"),
      { params: { id: "dept_orgy" } }
    );
    expect(response.status).toBe(404);
    expect(mockPrisma.departmentBacklogItem.findMany).not.toHaveBeenCalled();
  });

  it("PATCH cannot set knowledgeBaseId from another org (404)", async () => {
    requireOrgIdMock.mockResolvedValue(SCOPE_X);
    mockPrisma.department.findFirst.mockResolvedValue({ id: "dept_x" });
    mockPrisma.knowledgeBase.findFirst.mockResolvedValue(null);
    const response = await patchDepartment(
      new NextRequest("https://kiln.test/api/departments/dept_x", {
        method: "PATCH",
        body: JSON.stringify({ knowledgeBaseId: "kb_orgy" }),
      }),
      { params: { id: "dept_x" } }
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Knowledge base not found");
    expect(mockPrisma.department.update).not.toHaveBeenCalled();
  });

  it("PATCH accepts knowledgeBaseId when KB belongs to caller's org", async () => {
    requireOrgIdMock.mockResolvedValue(SCOPE_X);
    mockPrisma.department.findFirst.mockResolvedValue({ id: "dept_x" });
    mockPrisma.knowledgeBase.findFirst.mockResolvedValue({ id: "kb_x" });
    mockPrisma.department.update.mockResolvedValue({ id: "dept_x", knowledgeBaseId: "kb_x" });
    const response = await patchDepartment(
      new NextRequest("https://kiln.test/api/departments/dept_x", {
        method: "PATCH",
        body: JSON.stringify({ knowledgeBaseId: "kb_x" }),
      }),
      { params: { id: "dept_x" } }
    );
    expect(response.status).toBe(200);
    expect(mockPrisma.department.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ knowledgeBaseId: "kb_x" }),
      })
    );
  });

  it("PATCH allows clearing knowledgeBaseId via null", async () => {
    requireOrgIdMock.mockResolvedValue(SCOPE_X);
    mockPrisma.department.findFirst.mockResolvedValue({ id: "dept_x" });
    mockPrisma.department.update.mockResolvedValue({ id: "dept_x", knowledgeBaseId: null });
    const response = await patchDepartment(
      new NextRequest("https://kiln.test/api/departments/dept_x", {
        method: "PATCH",
        body: JSON.stringify({ knowledgeBaseId: null }),
      }),
      { params: { id: "dept_x" } }
    );
    expect(response.status).toBe(200);
    expect(mockPrisma.knowledgeBase.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.department.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ knowledgeBaseId: null }),
      })
    );
  });

  // Reference variable to avoid unused-import warning if SCOPE_Y is not yet used.
  it("Org scopes are distinct constants", () => {
    expect(SCOPE_X.orgId).not.toBe(SCOPE_Y.orgId);
  });
});
