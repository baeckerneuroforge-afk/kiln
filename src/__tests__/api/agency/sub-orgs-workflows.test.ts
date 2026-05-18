import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgencyRole } from "@prisma/client";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    orgRelationship: { findFirst: vi.fn() },
    agencyMembership: { findUnique: vi.fn() },
    agentTeam: { findMany: vi.fn() },
    teamExecution: { findMany: vi.fn() },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "@/app/api/agency/sub-orgs/[id]/workflows/route";

const REL_ID = "rel_1";
const AGENCY_ORG_ID = "org_agency";
const CHILD_ORG_ID = "org_child";
const USER_ID = "user_1";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest() {
  return new Request("http://localhost/api/agency/sub-orgs/rel_1/workflows");
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

describe("GET /api/agency/sub-orgs/[id]/workflows", () => {
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
    expect(prismaMock.agentTeam.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for VIEWER", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockRelationship();
    mockAgencyRole("VIEWER");

    const res = await GET(makeRequest(), { params: { id: REL_ID } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
    expect(prismaMock.agentTeam.findMany).not.toHaveBeenCalled();
  });

  it.each<AgencyRole>(["OWNER", "ADMIN", "CONSULTANT"])(
    "allows %s to read workflows",
    async (role) => {
      authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
      mockRelationship();
      mockAgencyRole(role);
      prismaMock.agentTeam.findMany.mockResolvedValue([]);

      const res = await GET(makeRequest(), { params: { id: REL_ID } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ items: [] });
      expect(prismaMock.agentTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: CHILD_ORG_ID } }),
      );
      expect(prismaMock.teamExecution.findMany).not.toHaveBeenCalled();
    },
  );

  it("maps workflow rows with 30-day execution stats", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockRelationship();
    mockAgencyRole("OWNER");
    prismaMock.agentTeam.findMany.mockResolvedValue([
      {
        id: "team_1",
        name: "Intake",
        status: "ACTIVE",
        createdAt: new Date("2026-04-01T09:00:00Z"),
        updatedAt: new Date("2026-05-01T11:00:00Z"),
      },
    ]);
    prismaMock.teamExecution.findMany.mockResolvedValue([
      {
        teamId: "team_1",
        status: "COMPLETED",
        startedAt: new Date("2026-05-01T10:00:00Z"),
        completedAt: new Date("2026-05-01T10:00:05Z"),
      },
      {
        teamId: "team_1",
        status: "FAILED",
        startedAt: new Date("2026-05-01T11:00:00Z"),
        completedAt: null,
      },
    ]);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([
      {
        id: "team_1",
        name: "Intake",
        status: "ACTIVE",
        runs30d: 2,
        successRate: 50,
        avgDurationMs: 5000,
        lastRunAt: "2026-05-01T11:00:00.000Z",
        updatedAt: "2026-05-01T11:00:00.000Z",
      },
    ]);
  });
});
