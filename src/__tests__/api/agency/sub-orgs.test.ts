/**
 * Sub-org CRUD smoke tests.
 *
 * Exercises POST /api/agency/sub-orgs and DELETE /api/agency/sub-orgs/[id]
 * with mocked Clerk + Prisma. Focus is on the auth + permission decisions
 * (the parts most likely to regress when someone touches the perm helper);
 * the actual create-and-list happy-path runs end-to-end so a forgotten
 * Prisma argument blows up here rather than in production.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ADMIN_ENV = process.env.ADMIN_USER_IDS;
const AGENCY_USER = "user_agency_1";
const AGENCY_ORG = "org_agency_1";

beforeAll(() => {
  // Keep admin list empty — we test the non-admin path here.
  process.env.ADMIN_USER_IDS = "";
});
afterAll(() => {
  if (ORIGINAL_ADMIN_ENV === undefined) {
    delete process.env.ADMIN_USER_IDS;
  } else {
    process.env.ADMIN_USER_IDS = ORIGINAL_ADMIN_ENV;
  }
});

const mockAuth = vi.hoisted(() => vi.fn());
const mockClerkClient = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  orgRelationship: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  agent: { groupBy: vi.fn() },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { POST as listOrCreatePOST, GET as listGET } from "@/app/api/agency/sub-orgs/route";
import { DELETE as archiveDELETE } from "@/app/api/agency/sub-orgs/[id]/route";

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/agency/sub-orgs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agency/sub-orgs", () => {
  beforeEach(() => {
    Object.values(mockPrisma).forEach((m) =>
      Object.values(m).forEach((fn) => fn.mockReset())
    );
    mockAuth.mockReset();
    mockClerkClient.mockReset();
  });

  it("401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
    const res = await listOrCreatePOST(makePostRequest({ name: "Acme" }));
    expect(res.status).toBe(401);
  });

  it("400 when no active org selected", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: null });
    const res = await listOrCreatePOST(makePostRequest({ name: "Acme" }));
    expect(res.status).toBe(400);
  });

  it("400 when name is missing or empty", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    const res = await listOrCreatePOST(makePostRequest({ name: "  " }));
    expect(res.status).toBe(400);
  });

  it("403 when caller's plan isn't agency-tier", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "PRO" });
    const res = await listOrCreatePOST(makePostRequest({ name: "Acme" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.reason).toBe("wrong_tier");
  });

  it("403 when BUSINESS plan hits its 5-suborg cap", async () => {
    // AGENCY + ENTERPRISE are now unlimited; the BUSINESS tier (added in
    // Phase 3) is the lowest plan that still has a hard cap, so we use it
    // here to exercise the capacity_reached branch.
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "BUSINESS" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(5);
    const res = await listOrCreatePOST(makePostRequest({ name: "Acme" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.reason).toBe("capacity_reached");
    expect(body.max).toBe(5);
    expect(body.current).toBe(5);
  });

  it("creates the Clerk org with createdBy set to the caller", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(3);
    const createOrg = vi.fn().mockResolvedValueOnce({ id: "org_new_child" });
    mockClerkClient.mockResolvedValueOnce({
      organizations: { createOrganization: createOrg },
    });
    mockPrisma.orgRelationship.create.mockResolvedValueOnce({
      id: "rel_1",
      createdAt: new Date("2026-05-05T00:00:00Z"),
      subOrgStatus: "ACTIVE",
    });

    const res = await listOrCreatePOST(makePostRequest({ name: "Acme Corp" }));
    expect(res.status).toBe(201);

    expect(createOrg).toHaveBeenCalledWith({
      name: "Acme Corp",
      createdBy: AGENCY_USER,
    });
    expect(mockPrisma.orgRelationship.create).toHaveBeenCalledWith({
      data: {
        parentOrgId: AGENCY_ORG,
        childOrgId: "org_new_child",
        createdBy: AGENCY_USER,
        subOrgName: "Acme Corp",
      },
    });

    const body = await res.json();
    expect(body).toMatchObject({
      childOrgId: "org_new_child",
      name: "Acme Corp",
      status: "ACTIVE",
      agentCount: 0,
    });
  });
});

describe("GET /api/agency/sub-orgs", () => {
  beforeEach(() => {
    Object.values(mockPrisma).forEach((m) =>
      Object.values(m).forEach((fn) => fn.mockReset())
    );
    mockAuth.mockReset();
  });

  it("returns subOrgs scoped to the active agency, with cached agent counts", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([
      {
        id: "rel_1",
        childOrgId: "org_child_1",
        subOrgName: "Acme",
        subOrgStatus: "ACTIVE",
        createdAt: new Date("2026-05-01T00:00:00Z"),
      },
      {
        id: "rel_2",
        childOrgId: "org_child_2",
        subOrgName: "Beta",
        subOrgStatus: "ARCHIVED",
        createdAt: new Date("2026-05-02T00:00:00Z"),
      },
    ]);
    mockPrisma.agent.groupBy.mockResolvedValueOnce([
      { orgId: "org_child_1", _count: { _all: 5 } },
    ]);

    const res = await listGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subOrgs).toHaveLength(2);
    expect(body.subOrgs[0]).toMatchObject({
      childOrgId: "org_child_1",
      agentCount: 5,
    });
    expect(body.subOrgs[1]).toMatchObject({
      childOrgId: "org_child_2",
      agentCount: 0,
    });
  });
});

describe("DELETE /api/agency/sub-orgs/[id]", () => {
  beforeEach(() => {
    Object.values(mockPrisma).forEach((m) =>
      Object.values(m).forEach((fn) => fn.mockReset())
    );
    mockAuth.mockReset();
  });

  it("404 when the relationship belongs to a different agency", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce(null);
    const res = await archiveDELETE(new Request("http://localhost/x"), {
      params: { id: "rel_belongs_to_other_agency" },
    });
    expect(res.status).toBe(404);
  });

  it("archives the relationship when caller owns it", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce({
      id: "rel_1",
      parentOrgId: AGENCY_ORG,
    });
    mockPrisma.orgRelationship.update.mockResolvedValueOnce({});
    const res = await archiveDELETE(new Request("http://localhost/x"), {
      params: { id: "rel_1" },
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.orgRelationship.update).toHaveBeenCalledWith({
      where: { id: "rel_1" },
      data: { subOrgStatus: "ARCHIVED" },
    });
  });
});
