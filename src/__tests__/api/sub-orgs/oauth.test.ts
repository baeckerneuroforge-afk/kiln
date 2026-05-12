/**
 * Sprint 19.7.5 — /api/sub-orgs/[id]/oauth list + disconnect.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockMembership = vi.hoisted(() => vi.fn());
const mockLogAudit = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findUnique: vi.fn() },
  integrationConnection: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/audit/logger", () => ({ logAudit: mockLogAudit }));
vi.mock("@/lib/permissions/sub-org-permissions", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getUserSubOrgMembership: mockMembership };
});
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { GET as listGET } from "@/app/api/sub-orgs/[id]/oauth/route";
import { DELETE as disconnectDELETE } from "@/app/api/sub-orgs/[id]/oauth/[provider]/route";

beforeEach(() => {
  mockAuth.mockReset();
  mockMembership.mockReset();
  mockLogAudit.mockReset();
  mockPrisma.orgRelationship.findUnique.mockReset();
  mockPrisma.integrationConnection.findMany.mockReset();
  mockPrisma.integrationConnection.findFirst.mockReset();
  mockPrisma.integrationConnection.update.mockReset();
});

describe("GET /api/sub-orgs/[id]/oauth", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await listGET(new Request("http://localhost"), { params: { id: "sub_1" } });
    expect(res.status).toBe(401);
  });

  it("404 when caller is not a member", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce(null);
    const res = await listGET(new Request("http://localhost"), { params: { id: "sub_1" } });
    expect(res.status).toBe(404);
  });

  it("returns active OAuth connections scoped to the sub-org's child orgId", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "READ_ONLY" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({ childOrgId: "org_child" });
    const now = new Date();
    mockPrisma.integrationConnection.findMany.mockResolvedValueOnce([
      { id: "c1", provider: "gmail", name: "Gmail (alice@example.com)", createdAt: now, lastSyncAt: now },
      { id: "c2", provider: "slack", name: "Slack — Acme", createdAt: now, lastSyncAt: null },
    ]);

    const res = await listGET(new Request("http://localhost"), { params: { id: "sub_1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections).toHaveLength(2);
    expect(body.connections[0].identifier).toBe("Gmail (alice@example.com)");
    // Scoped by the resolved childOrgId — not by userId — so an agency op
    // sees the sub-org's connections regardless of who connected them.
    expect(mockPrisma.integrationConnection.findMany.mock.calls[0][0].where.orgId).toBe(
      "org_child",
    );
  });
});

describe("DELETE /api/sub-orgs/[id]/oauth/[provider]", () => {
  it("400 on unsupported provider", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    const res = await disconnectDELETE(new Request("http://localhost"), {
      params: { id: "sub_1", provider: "made-up" },
    });
    expect(res.status).toBe(400);
  });

  it("403 when caller lacks integrations.manage", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "USE_AGENTS" });
    const res = await disconnectDELETE(new Request("http://localhost"), {
      params: { id: "sub_1", provider: "slack" },
    });
    expect(res.status).toBe(403);
  });

  it("404 when no connection exists for the provider", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "FULL_ACCESS" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({ childOrgId: "org_child" });
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce(null);
    const res = await disconnectDELETE(new Request("http://localhost"), {
      params: { id: "sub_1", provider: "slack" },
    });
    expect(res.status).toBe(404);
  });

  it("flips isActive=false and logs audit on success", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ permissionSet: "FULL_ACCESS" });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({ childOrgId: "org_child" });
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce({ id: "c1", name: "Slack — Acme" });
    mockPrisma.integrationConnection.update.mockResolvedValueOnce({});

    const res = await disconnectDELETE(new Request("http://localhost"), {
      params: { id: "sub_1", provider: "slack" },
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.integrationConnection.update.mock.calls[0][0].data.isActive).toBe(false);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "INTEGRATION_DISCONNECTED", orgId: "org_child" }),
    );
  });
});
