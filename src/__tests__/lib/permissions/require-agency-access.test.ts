/**
 * Sprint 19.7.6 — requireAgencyAccess middleware helper.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { agencyMembership: { findUnique: mockFindUnique } },
}));

import { requireAgencyAccess } from "@/lib/permissions/require-agency-access";

const baseMembership = {
  id: "am_1",
  agencyClerkOrgId: "org_agency",
  userId: "user_1",
  role: "VIEWER" as const,
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

describe("requireAgencyAccess", () => {
  it("401 when caller is not authenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const result = await requireAgencyAccess("org_agency");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("404 when caller has no agency-membership row", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockFindUnique.mockResolvedValueOnce(null);
    const result = await requireAgencyAccess("org_agency");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it("403 when caller is a member but lacks the requested permission", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockFindUnique.mockResolvedValueOnce({ ...baseMembership, role: "VIEWER" });
    const result = await requireAgencyAccess("org_agency", "billing.manage");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("returns membership without permission check", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockFindUnique.mockResolvedValueOnce(baseMembership);
    const result = await requireAgencyAccess("org_agency");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("user_1");
      expect(result.membership.agencyClerkOrgId).toBe("org_agency");
    }
  });

  it("OWNER passes billing.manage check", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockFindUnique.mockResolvedValueOnce({ ...baseMembership, role: "OWNER" });
    const result = await requireAgencyAccess("org_agency", "billing.manage");
    expect(result.ok).toBe(true);
  });

  it("ADMIN fails billing.manage check", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockFindUnique.mockResolvedValueOnce({ ...baseMembership, role: "ADMIN" });
    const result = await requireAgencyAccess("org_agency", "billing.manage");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
