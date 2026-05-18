import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgencyRole } from "@prisma/client";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    orgRelationship: { findFirst: vi.fn() },
    agencyMembership: { findUnique: vi.fn() },
    auditEvent: { findMany: vi.fn() },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "@/app/api/agency/sub-orgs/[id]/activity/route";

const REL_ID = "rel_1";
const AGENCY_ORG_ID = "org_agency";
const CHILD_ORG_ID = "org_child";
const USER_ID = "user_1";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(path = "http://localhost/api/agency/sub-orgs/rel_1/activity") {
  return new Request(path);
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

describe("GET /api/agency/sub-orgs/[id]/activity", () => {
  it("returns 401 when the caller is not signed in", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(401);
    expect(prismaMock.orgRelationship.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the relationship belongs to a different agency", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    prismaMock.orgRelationship.findFirst.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(404);
    expect(prismaMock.agencyMembership.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller has no AgencyMembership", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockRelationship();
    prismaMock.agencyMembership.findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(404);
    expect(prismaMock.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it.each<AgencyRole>(["OWNER", "ADMIN", "CONSULTANT", "VIEWER"])(
    "allows %s to read activity",
    async (role) => {
      authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
      mockRelationship();
      mockAgencyRole(role);
      prismaMock.auditEvent.findMany.mockResolvedValue([]);

      const res = await GET(makeRequest(), { params: { id: REL_ID } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ items: [], nextCursor: null });
      expect(prismaMock.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: CHILD_ORG_ID },
        }),
      );
    },
  );

  it("maps paginated audit events and category filters", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockRelationship();
    mockAgencyRole("OWNER");
    prismaMock.auditEvent.findMany.mockResolvedValue([
      {
        id: "evt_1",
        userId: USER_ID,
        category: "portal",
        action: "viewed",
        resourceId: REL_ID,
        resourceType: "OrgRelationship",
        severity: "info",
        createdAt: new Date("2026-05-01T10:00:00Z"),
        details: { tab: "overview" },
      },
    ]);

    const res = await GET(
      makeRequest("http://localhost/api/agency/sub-orgs/rel_1/activity?limit=1&category=portal"),
      { params: { id: REL_ID } },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([
      {
        id: "evt_1",
        userId: USER_ID,
        category: "portal",
        action: "viewed",
        resourceId: REL_ID,
        resourceType: "OrgRelationship",
        severity: "info",
        createdAt: "2026-05-01T10:00:00.000Z",
        details: { tab: "overview" },
      },
    ]);
    expect(prismaMock.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        where: { orgId: CHILD_ORG_ID, category: { in: ["portal"] } },
      }),
    );
  });
});
