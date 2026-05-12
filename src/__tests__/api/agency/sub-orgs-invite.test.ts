/**
 * Sprint 19.7.1 — sub-org invite endpoint covers role + permissionSet,
 * existing-user shortcut, and the Clerk invitation path with metadata.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockClerkClient = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findFirst: vi.fn() },
  subOrgMembership: { upsert: vi.fn() },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { POST as invitePOST } from "@/app/api/agency/sub-orgs/[id]/invite/route";

const AGENCY_USER = "user_agency_1";
const AGENCY_ORG = "org_agency_1";

beforeEach(() => {
  mockAuth.mockReset();
  mockClerkClient.mockReset();
  mockPrisma.orgRelationship.findFirst.mockReset();
  mockPrisma.subOrgMembership.upsert.mockReset();
});

function makeReq(body: unknown) {
  return new Request("http://localhost/api/agency/sub-orgs/rel_1/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ACTIVE_REL = {
  id: "rel_1",
  parentOrgId: AGENCY_ORG,
  childOrgId: "org_child_1",
  subOrgStatus: "ACTIVE" as const,
};

describe("POST /api/agency/sub-orgs/[id]/invite", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
    const res = await invitePOST(makeReq({ email: "a@b.com" }), { params: { id: "rel_1" } });
    expect(res.status).toBe(401);
  });

  it("404 when relationship belongs to another agency", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce(null);
    const res = await invitePOST(makeReq({ email: "a@b.com" }), { params: { id: "rel_x" } });
    expect(res.status).toBe(404);
  });

  it("400 when email is invalid", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce(ACTIVE_REL);
    const res = await invitePOST(makeReq({ email: "no-at-sign" }), { params: { id: "rel_1" } });
    expect(res.status).toBe(400);
  });

  it("400 when sub-org is archived", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce({
      ...ACTIVE_REL,
      subOrgStatus: "ARCHIVED",
    });
    const res = await invitePOST(makeReq({ email: "a@b.com" }), { params: { id: "rel_1" } });
    expect(res.status).toBe(400);
  });

  it("existing-user path creates SubOrgMembership directly with chosen role + permissionSet", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce(ACTIVE_REL);
    const createMembership = vi.fn().mockResolvedValue({});
    mockClerkClient.mockResolvedValueOnce({
      users: {
        getUserList: vi.fn().mockResolvedValueOnce({ data: [{ id: "user_existing" }] }),
      },
      organizations: {
        createOrganizationMembership: createMembership,
      },
    });

    const res = await invitePOST(
      makeReq({
        email: "existing@example.com",
        role: "ADMIN",
        permissionSet: "USE_AGENTS",
      }),
      { params: { id: "rel_1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "accepted", path: "existing-user" });
    expect(createMembership).toHaveBeenCalledWith({
      organizationId: "org_child_1",
      userId: "user_existing",
      role: "org:admin",
    });
    expect(mockPrisma.subOrgMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subOrgId_userId: { subOrgId: "rel_1", userId: "user_existing" } },
        create: expect.objectContaining({
          role: "ADMIN",
          permissionSet: "USE_AGENTS",
        }),
        update: { role: "ADMIN", permissionSet: "USE_AGENTS" },
      }),
    );
  });

  it("treats 'already a member' from Clerk as benign and still records the KILN membership", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce(ACTIVE_REL);
    const createMembership = vi.fn().mockRejectedValueOnce(
      new Error("User is already a member of this organization"),
    );
    mockClerkClient.mockResolvedValueOnce({
      users: { getUserList: vi.fn().mockResolvedValueOnce({ data: [{ id: "user_existing" }] }) },
      organizations: { createOrganizationMembership: createMembership },
    });

    const res = await invitePOST(
      makeReq({ email: "existing@example.com", role: "MEMBER", permissionSet: "READ_ONLY" }),
      { params: { id: "rel_1" } },
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.subOrgMembership.upsert).toHaveBeenCalled();
  });

  it("new-email path creates a Clerk invitation with publicMetadata { kilnRole, permissionSet }", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce(ACTIVE_REL);
    const createInvitation = vi.fn().mockResolvedValueOnce({
      id: "inv_1",
      emailAddress: "new@example.com",
      status: "pending",
    });
    mockClerkClient.mockResolvedValueOnce({
      users: { getUserList: vi.fn().mockResolvedValueOnce({ data: [] }) },
      organizations: { createOrganizationInvitation: createInvitation },
    });

    const res = await invitePOST(
      makeReq({
        email: "new@example.com",
        role: "VIEWER",
        permissionSet: "USE_AGENTS_PLUS_KNOWLEDGE",
      }),
      { params: { id: "rel_1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      path: "invitation",
      role: "VIEWER",
      permissionSet: "USE_AGENTS_PLUS_KNOWLEDGE",
    });
    expect(createInvitation).toHaveBeenCalledWith({
      organizationId: "org_child_1",
      emailAddress: "new@example.com",
      role: "org:member",
      inviterUserId: AGENCY_USER,
      publicMetadata: {
        kilnRole: "VIEWER",
        permissionSet: "USE_AGENTS_PLUS_KNOWLEDGE",
      },
    });
  });

  it("defaults role=MEMBER and permissionSet=READ_ONLY when omitted", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce(ACTIVE_REL);
    const createInvitation = vi.fn().mockResolvedValueOnce({
      id: "inv_2",
      emailAddress: "new@example.com",
      status: "pending",
    });
    mockClerkClient.mockResolvedValueOnce({
      users: { getUserList: vi.fn().mockResolvedValueOnce({ data: [] }) },
      organizations: { createOrganizationInvitation: createInvitation },
    });

    const res = await invitePOST(makeReq({ email: "new@example.com" }), { params: { id: "rel_1" } });
    expect(res.status).toBe(200);
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "org:member",
        publicMetadata: { kilnRole: "MEMBER", permissionSet: "READ_ONLY" },
      }),
    );
  });

  it("ignores unknown role/permissionSet values and falls back to defaults", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce(ACTIVE_REL);
    const createInvitation = vi.fn().mockResolvedValueOnce({
      id: "inv_3",
      emailAddress: "new@example.com",
      status: "pending",
    });
    mockClerkClient.mockResolvedValueOnce({
      users: { getUserList: vi.fn().mockResolvedValueOnce({ data: [] }) },
      organizations: { createOrganizationInvitation: createInvitation },
    });

    const res = await invitePOST(
      makeReq({
        email: "new@example.com",
        role: "SUPER_USER",
        permissionSet: "EVERYTHING",
      }),
      { params: { id: "rel_1" } },
    );
    expect(res.status).toBe(200);
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        publicMetadata: { kilnRole: "MEMBER", permissionSet: "READ_ONLY" },
      }),
    );
  });
});
