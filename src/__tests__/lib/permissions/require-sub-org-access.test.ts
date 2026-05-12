/**
 * Sprint 19.7.1 — requireSubOrgAccess middleware helper.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { subOrgMembership: { findUnique: mockFindUnique } },
}));

import { requireSubOrgAccess } from "@/lib/permissions/require-sub-org-access";

const baseMembership = {
  id: "mem_1",
  subOrgId: "sub_1",
  userId: "user_1",
  role: "MEMBER" as const,
  permissionSet: "READ_ONLY" as const,
  invitedById: null,
  invitedAt: null,
  acceptedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  mockAuth.mockReset();
  mockFindUnique.mockReset();
});

describe("requireSubOrgAccess", () => {
  it("401 when caller is not authenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const result = await requireSubOrgAccess("sub_1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("404 when caller has no membership in the sub-org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockFindUnique.mockResolvedValueOnce(null);
    const result = await requireSubOrgAccess("sub_1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it("403 when caller is a member but lacks the requested permission", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockFindUnique.mockResolvedValueOnce({ ...baseMembership, permissionSet: "READ_ONLY" });
    const result = await requireSubOrgAccess("sub_1", "agents.write");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("returns the membership when allowed (no permission requested)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockFindUnique.mockResolvedValueOnce(baseMembership);
    const result = await requireSubOrgAccess("sub_1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("user_1");
      expect(result.membership.subOrgId).toBe("sub_1");
    }
  });

  it("returns the membership when the requested permission is granted", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockFindUnique.mockResolvedValueOnce({ ...baseMembership, permissionSet: "FULL_ACCESS" });
    const result = await requireSubOrgAccess("sub_1", "memberships.manage");
    expect(result.ok).toBe(true);
  });
});
