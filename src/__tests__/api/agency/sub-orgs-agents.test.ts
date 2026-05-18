import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgencyRole } from "@prisma/client";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    orgRelationship: { findFirst: vi.fn() },
    agencyMembership: { findUnique: vi.fn() },
    agent: { findMany: vi.fn() },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "@/app/api/agency/sub-orgs/[id]/agents/route";

const REL_ID = "rel_1";
const AGENCY_ORG_ID = "org_agency";
const CHILD_ORG_ID = "org_child";
const USER_ID = "user_1";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest() {
  return new Request("http://localhost/api/agency/sub-orgs/rel_1/agents");
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

describe("GET /api/agency/sub-orgs/[id]/agents", () => {
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
    expect(prismaMock.agent.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for VIEWER", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockRelationship();
    mockAgencyRole("VIEWER");

    const res = await GET(makeRequest(), { params: { id: REL_ID } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
    expect(prismaMock.agent.findMany).not.toHaveBeenCalled();
  });

  it.each<AgencyRole>(["OWNER", "ADMIN", "CONSULTANT"])(
    "allows %s to read agents",
    async (role) => {
      authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
      mockRelationship();
      mockAgencyRole(role);
      prismaMock.agent.findMany.mockResolvedValue([]);

      const res = await GET(makeRequest(), { params: { id: REL_ID } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ items: [] });
      expect(prismaMock.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: CHILD_ORG_ID } }),
      );
    },
  );

  it("maps agent rows into the lightweight response shape", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockRelationship();
    mockAgencyRole("OWNER");
    prismaMock.agent.findMany.mockResolvedValue([
      {
        id: "agent_1",
        name: "Reception",
        slug: "reception",
        mode: "CHAT",
        status: "LIVE",
        llmModel: "claude-sonnet",
        lastRunAt: new Date("2026-05-01T10:00:00Z"),
        updatedAt: new Date("2026-05-01T11:00:00Z"),
        _count: { conversations: 7 },
      },
    ]);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([
      {
        id: "agent_1",
        name: "Reception",
        slug: "reception",
        mode: "CHAT",
        status: "LIVE",
        llmModel: "claude-sonnet",
        lastRunAt: "2026-05-01T10:00:00.000Z",
        updatedAt: "2026-05-01T11:00:00.000Z",
        conversationCount: 7,
      },
    ]);
  });
});
