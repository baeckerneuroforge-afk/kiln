/**
 * Sprint 19.7.6 — /api/agency/team GET + POST.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockClerkClient = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agencyMembership: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  agencyMemberSubOrgAccess: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  user: { findMany: vi.fn() },
  orgRelationship: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { GET, POST } from "@/app/api/agency/team/route";

const AGENCY_USER = "user_agency_1";
const AGENCY_ORG = "org_agency_1";

beforeEach(() => {
  mockAuth.mockReset();
  mockClerkClient.mockReset();
  mockPrisma.agencyMembership.findUnique.mockReset();
  mockPrisma.agencyMembership.findMany.mockReset();
  mockPrisma.agencyMembership.upsert.mockReset();
  mockPrisma.agencyMemberSubOrgAccess.deleteMany.mockReset();
  mockPrisma.agencyMemberSubOrgAccess.createMany.mockReset();
  mockPrisma.user.findMany.mockReset();
  mockPrisma.orgRelationship.findMany.mockReset();
  mockPrisma.$transaction.mockReset().mockImplementation((ops: unknown) => Promise.all(ops as Promise<unknown>[]));
});

function makePostReq(body: unknown) {
  return new Request("http://localhost/api/agency/team", {
    method: "POST",
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

describe("GET /api/agency/team", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("400 when no active organization", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: null });
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("404 when caller is not an agency-member", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("403 when caller lacks members.manage", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce({
      ...OWNER_MEMBERSHIP,
      role: "VIEWER",
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns enriched member list with assignment counts", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockPrisma.agencyMembership.findMany.mockResolvedValueOnce([
      { ...OWNER_MEMBERSHIP, subOrgAccess: [] },
      {
        id: "am_consultant",
        agencyClerkOrgId: AGENCY_ORG,
        userId: "user_2",
        role: "CONSULTANT",
        invitedById: AGENCY_USER,
        invitedAt: new Date(),
        acceptedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        subOrgAccess: [
          { id: "ac_1", subOrgId: "sub_a", permissionOverride: null },
          { id: "ac_2", subOrgId: "sub_b", permissionOverride: "READ_ONLY" },
        ],
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: AGENCY_USER, email: "andre@x.de", firstName: "André", lastName: null },
      { id: "user_2", email: "kollege@x.de", firstName: "Kollege", lastName: null },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { members: unknown[] };
    expect(data.members).toHaveLength(2);

    const owner = data.members[0] as { hasAllSubOrgs: boolean; role: string; assignedSubOrgCount: number };
    expect(owner.role).toBe("OWNER");
    expect(owner.hasAllSubOrgs).toBe(true);
    expect(owner.assignedSubOrgCount).toBe(0);

    const consultant = data.members[1] as { hasAllSubOrgs: boolean; role: string; assignedSubOrgCount: number };
    expect(consultant.role).toBe("CONSULTANT");
    expect(consultant.hasAllSubOrgs).toBe(false);
    expect(consultant.assignedSubOrgCount).toBe(2);
  });
});

describe("POST /api/agency/team", () => {
  it("400 when email is invalid", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    const res = await POST(makePostReq({ email: "no-at-sign" }));
    expect(res.status).toBe(400);
  });

  it("403 when an ADMIN tries to invite an OWNER", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce({
      ...OWNER_MEMBERSHIP,
      role: "ADMIN",
    });
    const res = await POST(makePostReq({ email: "new@x.de", role: "OWNER" }));
    expect(res.status).toBe(403);
  });

  it("400 when a subOrgId belongs to a different agency", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([{ id: "sub_a" }]); // only 1 of 2 valid

    const res = await POST(
      makePostReq({
        email: "new@x.de",
        role: "CONSULTANT",
        subOrgIds: ["sub_a", "sub_other_agency"],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("existing-user path attaches Clerk membership + materialises AgencyMembership row", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);

    const createMembership = vi.fn().mockResolvedValue({});
    mockClerkClient.mockResolvedValueOnce({
      users: {
        getUserList: vi.fn().mockResolvedValueOnce({ data: [{ id: "user_existing" }] }),
      },
      organizations: { createOrganizationMembership: createMembership },
    });

    mockPrisma.agencyMembership.upsert.mockResolvedValueOnce({
      id: "am_new",
      agencyClerkOrgId: AGENCY_ORG,
      userId: "user_existing",
      role: "CONSULTANT",
    });
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([{ id: "sub_a" }]);

    const res = await POST(
      makePostReq({
        email: "existing@x.de",
        role: "CONSULTANT",
        subOrgIds: ["sub_a"],
        permissionOverrides: { sub_a: "USE_AGENTS_PLUS_KNOWLEDGE" },
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { path: string; role: string };
    expect(data.path).toBe("existing-user");
    expect(data.role).toBe("CONSULTANT");

    expect(createMembership).toHaveBeenCalledWith({
      organizationId: AGENCY_ORG,
      userId: "user_existing",
      role: "org:member",
    });
    expect(mockPrisma.agencyMembership.upsert).toHaveBeenCalled();
    expect(mockPrisma.agencyMemberSubOrgAccess.createMany).toHaveBeenCalledWith({
      data: [
        { agencyMembershipId: "am_new", subOrgId: "sub_a", permissionOverride: "USE_AGENTS_PLUS_KNOWLEDGE" },
      ],
    });
  });

  it("invitation path creates Clerk invitation with kilnAgencyRole metadata", async () => {
    mockAuth.mockResolvedValue({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(OWNER_MEMBERSHIP);

    const createInvitation = vi.fn().mockResolvedValueOnce({
      id: "inv_1",
      emailAddress: "fresh@x.de",
      status: "pending",
    });
    mockClerkClient.mockResolvedValueOnce({
      users: { getUserList: vi.fn().mockResolvedValueOnce({ data: [] }) },
      organizations: { createOrganizationInvitation: createInvitation },
    });

    const res = await POST(
      makePostReq({
        email: "fresh@x.de",
        role: "VIEWER",
        subOrgIds: [],
      }),
    );
    expect(res.status).toBe(200);
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: AGENCY_ORG,
        emailAddress: "fresh@x.de",
        role: "org:member",
        inviterUserId: AGENCY_USER,
        publicMetadata: expect.objectContaining({
          kilnAgencyRole: "VIEWER",
          kilnAssignedSubOrgIds: [],
        }),
      }),
    );
  });
});
