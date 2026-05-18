import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgencyRole } from "@prisma/client";

const { authMock, clerkClientMock, getMembershipsMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getMembershipsMock: vi.fn(),
  clerkClientMock: vi.fn(),
  prismaMock: {
    orgRelationship: { findFirst: vi.fn() },
    agencyMembership: { findUnique: vi.fn() },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "@/app/api/agency/sub-orgs/[id]/members/route";

const REL_ID = "rel_1";
const AGENCY_ORG_ID = "org_agency";
const CHILD_ORG_ID = "org_child";
const USER_ID = "user_1";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
  clerkClientMock.mockResolvedValue({
    organizations: { getOrganizationMembershipList: getMembershipsMock },
  });
  mockRelationship();
  mockAgencyRole("OWNER");
  getMembershipsMock.mockResolvedValue({ data: [], totalCount: 0 });
});

function makeRequest() {
  return new Request("http://localhost/api/agency/sub-orgs/rel_1/members");
}

function mockRelationship() {
  prismaMock.orgRelationship.findFirst.mockResolvedValue({
    id: REL_ID,
    parentOrgId: AGENCY_ORG_ID,
    childOrgId: CHILD_ORG_ID,
  });
}

function mockAgencyRole(role: AgencyRole) {
  prismaMock.agencyMembership.findUnique.mockResolvedValue({
    id: `mem_${role}`,
    agencyClerkOrgId: AGENCY_ORG_ID,
    userId: USER_ID,
    role,
  });
}

describe("GET /api/agency/sub-orgs/[id]/members", () => {
  it("returns 401 when the caller is not signed in", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(401);
    expect(prismaMock.orgRelationship.findFirst).not.toHaveBeenCalled();
    expect(getMembershipsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the relationship belongs to a different agency", async () => {
    prismaMock.orgRelationship.findFirst.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(404);
    expect(prismaMock.agencyMembership.findUnique).not.toHaveBeenCalled();
    expect(getMembershipsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller has no AgencyMembership", async () => {
    prismaMock.agencyMembership.findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(404);
    expect(getMembershipsMock).not.toHaveBeenCalled();
  });

  it("returns 403 for VIEWER", async () => {
    mockAgencyRole("VIEWER");

    const res = await GET(makeRequest(), { params: { id: REL_ID } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
    expect(getMembershipsMock).not.toHaveBeenCalled();
  });

  it.each<AgencyRole>(["OWNER", "ADMIN", "CONSULTANT"])(
    "allows %s to read members",
    async (role) => {
      mockAgencyRole(role);

      const res = await GET(makeRequest(), { params: { id: REL_ID } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ items: [], total: 0 });
      expect(getMembershipsMock).toHaveBeenCalledWith({
        organizationId: CHILD_ORG_ID,
        limit: 100,
      });
    },
  );

  it("maps Clerk memberships into the response shape", async () => {
    getMembershipsMock.mockResolvedValue({
      data: [
        {
          id: "orgmem_1",
          role: "org:admin",
          createdAt: "2026-05-01T10:00:00Z",
          publicUserData: {
            userId: "user_customer",
            firstName: "Ada",
            lastName: "Lovelace",
            identifier: "ada@example.com",
            imageUrl: "https://img.example.com/ada.png",
          },
        },
      ],
      totalCount: 1,
    });

    const res = await GET(makeRequest(), { params: { id: REL_ID } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      items: [
        {
          membershipId: "orgmem_1",
          userId: "user_customer",
          name: "Ada Lovelace",
          email: "ada@example.com",
          role: "org:admin",
          imageUrl: "https://img.example.com/ada.png",
          joinedAt: "2026-05-01T10:00:00.000Z",
        },
      ],
      total: 1,
    });
  });
});
