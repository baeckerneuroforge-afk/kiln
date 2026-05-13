/**
 * Sprint 19.7.6 — /api/agency/team/[id] PATCH + DELETE.
 *
 * Covers the boundary cases that are easy to get wrong:
 *   - ADMIN cannot touch an OWNER
 *   - cannot demote the last OWNER
 *   - cannot remove yourself
 *   - sub-org assignments are scoped to the agency
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockClerkClient = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agencyMembership: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  agencyMemberSubOrgAccess: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  orgRelationship: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { PATCH, DELETE } from "@/app/api/agency/team/[id]/route";

const AGENCY_USER = "user_agency_1";
const AGENCY_ORG = "org_agency_1";

beforeEach(() => {
  mockAuth.mockReset();
  mockClerkClient.mockReset();
  for (const m of Object.values(mockPrisma.agencyMembership)) {
    if (typeof (m as { mockReset?: () => void }).mockReset === "function") {
      (m as { mockReset: () => void }).mockReset();
    }
  }
  mockPrisma.agencyMemberSubOrgAccess.deleteMany.mockReset();
  mockPrisma.agencyMemberSubOrgAccess.createMany.mockReset();
  mockPrisma.orgRelationship.findMany.mockReset();
  mockPrisma.$transaction.mockReset().mockImplementation((ops: unknown) =>
    Promise.all(ops as Promise<unknown>[]),
  );
});

function makePatchReq(body: unknown) {
  return new Request("http://localhost/api/agency/team/am_target", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const OWNER_MEMBERSHIP = {
  id: "am_owner",
  agencyClerkOrgId: AGENCY_ORG,
  userId: AGENCY_USER,
  role: "OWNER" as const,
  invitedById: null,
  invitedAt: null,
  acceptedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("PATCH /api/agency/team/[id]", () => {
  it("403 when an ADMIN tries to modify an OWNER", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce({
      ...OWNER_MEMBERSHIP,
      role: "ADMIN",
    });
    mockPrisma.agencyMembership.findFirst.mockResolvedValueOnce({
      id: "am_owner_other",
      agencyClerkOrgId: AGENCY_ORG,
      userId: "user_other_owner",
      role: "OWNER",
    });

    const res = await PATCH(makePatchReq({ role: "ADMIN" }), { params: { id: "am_owner_other" } });
    expect(res.status).toBe(403);
  });

  it("400 when demoting the last OWNER", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockPrisma.agencyMembership.findFirst.mockResolvedValueOnce({
      id: "am_self",
      agencyClerkOrgId: AGENCY_ORG,
      userId: AGENCY_USER,
      role: "OWNER",
    });
    mockPrisma.agencyMembership.count.mockResolvedValueOnce(1);

    const res = await PATCH(makePatchReq({ role: "ADMIN" }), { params: { id: "am_self" } });
    expect(res.status).toBe(400);
  });

  it("400 when subOrgId belongs to another agency", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockPrisma.agencyMembership.findFirst.mockResolvedValueOnce({
      id: "am_target",
      agencyClerkOrgId: AGENCY_ORG,
      userId: "user_target",
      role: "CONSULTANT",
    });
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([]); // 0 of 1 valid

    const res = await PATCH(
      makePatchReq({ subOrgIds: ["sub_outside"] }),
      { params: { id: "am_target" } },
    );
    expect(res.status).toBe(400);
  });

  it("updates role and replaces assignments transactionally", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    const target = {
      id: "am_target",
      agencyClerkOrgId: AGENCY_ORG,
      userId: "user_target",
      role: "VIEWER" as const,
    };
    mockPrisma.agencyMembership.findFirst.mockResolvedValueOnce(target);
    mockPrisma.agencyMembership.update.mockResolvedValueOnce({ ...target, role: "CONSULTANT" });
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([
      { id: "sub_a" },
      { id: "sub_b" },
    ]);
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce({
      ...target,
      role: "CONSULTANT",
      subOrgAccess: [],
    });

    const res = await PATCH(
      makePatchReq({
        role: "CONSULTANT",
        subOrgIds: ["sub_a", "sub_b"],
        permissionOverrides: { sub_a: "USE_AGENTS" },
      }),
      { params: { id: "am_target" } },
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.agencyMembership.update).toHaveBeenCalledWith({
      where: { id: "am_target" },
      data: { role: "CONSULTANT" },
    });
    expect(mockPrisma.agencyMemberSubOrgAccess.createMany).toHaveBeenCalledWith({
      data: [
        { agencyMembershipId: "am_target", subOrgId: "sub_a", permissionOverride: "USE_AGENTS" },
        { agencyMembershipId: "am_target", subOrgId: "sub_b", permissionOverride: null },
      ],
    });
  });
});

describe("DELETE /api/agency/team/[id]", () => {
  it("400 when caller tries to remove themselves", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockPrisma.agencyMembership.findFirst.mockResolvedValueOnce({
      id: "am_self",
      agencyClerkOrgId: AGENCY_ORG,
      userId: AGENCY_USER, // same as caller
      role: "OWNER",
    });

    const res = await DELETE(new Request("http://localhost"), { params: { id: "am_self" } });
    expect(res.status).toBe(400);
  });

  it("400 when removing the last OWNER", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockPrisma.agencyMembership.findFirst.mockResolvedValueOnce({
      id: "am_last_owner",
      agencyClerkOrgId: AGENCY_ORG,
      userId: "user_other",
      role: "OWNER",
    });
    mockPrisma.agencyMembership.count.mockResolvedValueOnce(1);

    const res = await DELETE(new Request("http://localhost"), { params: { id: "am_last_owner" } });
    expect(res.status).toBe(400);
  });

  it("removes member and detaches Clerk membership (best-effort)", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockPrisma.agencyMembership.findFirst.mockResolvedValueOnce({
      id: "am_target",
      agencyClerkOrgId: AGENCY_ORG,
      userId: "user_target",
      role: "VIEWER",
    });

    const deleteOrgMembership = vi.fn().mockResolvedValue({});
    mockClerkClient.mockResolvedValueOnce({
      organizations: { deleteOrganizationMembership: deleteOrgMembership },
    });
    mockPrisma.agencyMembership.delete.mockResolvedValueOnce({});

    const res = await DELETE(new Request("http://localhost"), { params: { id: "am_target" } });
    expect(res.status).toBe(200);
    expect(deleteOrgMembership).toHaveBeenCalledWith({
      organizationId: AGENCY_ORG,
      userId: "user_target",
    });
    expect(mockPrisma.agencyMembership.delete).toHaveBeenCalledWith({
      where: { id: "am_target" },
    });
  });

  it("still deletes the local row when Clerk detach fails", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockPrisma.agencyMembership.findFirst.mockResolvedValueOnce({
      id: "am_target",
      agencyClerkOrgId: AGENCY_ORG,
      userId: "user_target",
      role: "VIEWER",
    });

    mockClerkClient.mockResolvedValueOnce({
      organizations: {
        deleteOrganizationMembership: vi.fn().mockRejectedValueOnce(new Error("clerk down")),
      },
    });
    mockPrisma.agencyMembership.delete.mockResolvedValueOnce({});

    const res = await DELETE(new Request("http://localhost"), { params: { id: "am_target" } });
    expect(res.status).toBe(200);
    expect(mockPrisma.agencyMembership.delete).toHaveBeenCalled();
  });
});
