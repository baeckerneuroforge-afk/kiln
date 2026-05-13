/**
 * Sprint 19.7.1 / 19.7.6.2 — sub-org invite endpoint.
 *
 * Auth is SubOrgMembership-driven (Sprint 19.7.6.2 rewrite): callers
 * with OWNER/ADMIN role OR FULL_ACCESS permissionSet pass; everyone
 * else gets 403/404. The old "must own the agency that this sub-org
 * belongs to" model was retired because it broke sub-org-mode users.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockClerkClient = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findUnique: vi.fn() },
  subOrgMembership: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  user: { findUnique: vi.fn() },
  emailLog: { create: vi.fn().mockResolvedValue({}) },
}));
const mockSendBrandedEmail = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/send-branded-email", () => ({
  sendBrandedEmail: mockSendBrandedEmail,
}));

import { POST as invitePOST } from "@/app/api/agency/sub-orgs/[id]/invite/route";

const CALLER = "user_caller";

const FULL_ACCESS_OWNER = {
  id: "mem_caller",
  subOrgId: "rel_1",
  userId: CALLER,
  role: "OWNER" as const,
  permissionSet: "FULL_ACCESS" as const,
  invitedById: null,
  invitedAt: null,
  acceptedAt: new Date(),
  onboardingStepCompleted: null,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  mockAuth.mockReset();
  mockClerkClient.mockReset();
  mockPrisma.orgRelationship.findUnique.mockReset();
  mockPrisma.subOrgMembership.findUnique.mockReset();
  mockPrisma.subOrgMembership.upsert.mockReset();
  mockPrisma.user.findUnique.mockReset();
  // Default: no user row found. Inviter lookup falls back to "KILN",
  // shouldSendEmail returns allow=true (no_user_row).
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.emailLog.create.mockReset();
  mockPrisma.emailLog.create.mockResolvedValue({});
  mockSendBrandedEmail.mockReset();
  mockSendBrandedEmail.mockResolvedValue({ ok: true });
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
  childOrgId: "org_child_1",
  subOrgStatus: "ACTIVE" as const,
};

describe("POST /api/agency/sub-orgs/[id]/invite", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await invitePOST(makeReq({ email: "a@b.com" }), { params: { id: "rel_1" } });
    expect(res.status).toBe(401);
  });

  it("404 when caller has no membership in the sub-org (cross-tenant or missing)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(null);
    const res = await invitePOST(makeReq({ email: "a@b.com" }), { params: { id: "rel_x" } });
    expect(res.status).toBe(404);
  });

  it("403 when caller is a sub-org MEMBER with USE_AGENTS (no memberships.manage)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce({
      ...FULL_ACCESS_OWNER,
      role: "MEMBER",
      permissionSet: "USE_AGENTS",
    });
    const res = await invitePOST(
      makeReq({ email: "a@b.com" }),
      { params: { id: "rel_1" } },
    );
    expect(res.status).toBe(403);
  });

  it("allows SubOrgRole OWNER even when permissionSet is below FULL_ACCESS", async () => {
    // Sprint 19.7.6.2 bypass: OWNER/ADMIN always manage members regardless
    // of permissionSet floor.
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce({
      ...FULL_ACCESS_OWNER,
      role: "OWNER",
      permissionSet: "READ_ONLY",
    });
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(ACTIVE_REL);
    mockClerkClient.mockResolvedValueOnce({
      users: { getUserList: vi.fn().mockResolvedValueOnce({ data: [] }) },
      organizations: {
        createOrganizationInvitation: vi.fn().mockResolvedValueOnce({
          id: "inv_owner",
          emailAddress: "x@y.de",
          status: "pending",
        }),
      },
    });

    const res = await invitePOST(makeReq({ email: "x@y.de" }), { params: { id: "rel_1" } });
    expect(res.status).toBe(200);
  });

  it("400 when email is invalid", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(ACTIVE_REL);
    const res = await invitePOST(makeReq({ email: "no-at-sign" }), { params: { id: "rel_1" } });
    expect(res.status).toBe(400);
  });

  it("400 when sub-org is archived", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({
      ...ACTIVE_REL,
      subOrgStatus: "ARCHIVED",
    });
    const res = await invitePOST(makeReq({ email: "a@b.com" }), { params: { id: "rel_1" } });
    expect(res.status).toBe(400);
  });

  it("existing-user path creates SubOrgMembership directly with chosen role + permissionSet", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(ACTIVE_REL);
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
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(ACTIVE_REL);
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
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(ACTIVE_REL);
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
      inviterUserId: CALLER,
      publicMetadata: {
        kilnRole: "VIEWER",
        permissionSet: "USE_AGENTS_PLUS_KNOWLEDGE",
      },
    });
  });

  it("defaults role=MEMBER and permissionSet=READ_ONLY when omitted", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(ACTIVE_REL);
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
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(ACTIVE_REL);
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

  // Sprint 19.7.8 — branded email notifications on top of Clerk's path.
  describe("email notifications (Sprint 19.7.8)", () => {
    it("path-2 sends the existing-user template with role + permission + locale", async () => {
      mockAuth.mockResolvedValueOnce({ userId: CALLER });
      mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
      mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({
        id: "rel_1",
        childOrgId: "org_child_1",
        parentOrgId: "org_parent_1",
        subOrgName: "ACME Sub",
        subOrgStatus: "ACTIVE",
      });
      // First call = inviter lookup; second call = recipient lookup;
      // third call = shouldSendEmail's User check (returns the same row).
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          firstName: "André",
          lastName: "Bäcker",
          email: "andre@x.de",
        })
        .mockResolvedValueOnce({
          preferredLanguage: "en",
          firstName: "Sarah",
          lastName: null,
        })
        .mockResolvedValueOnce({
          emailNotifications: true,
          notificationPreferences: {},
        });
      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUserList: vi.fn().mockResolvedValueOnce({ data: [{ id: "user_existing" }] }),
        },
        organizations: {
          createOrganizationMembership: vi.fn().mockResolvedValue({}),
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

      expect(mockSendBrandedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: "sub-org-member-invited-existing",
          orgId: "org_parent_1",
          subOrgId: "org_child_1",
          userId: "user_existing",
          to: "existing@example.com",
          data: expect.objectContaining({
            locale: "en",
            recipientName: "Sarah",
            inviterName: "André Bäcker",
            subOrgName: "ACME Sub",
            role: "ADMIN",
            permissionSet: "USE_AGENTS",
          }),
        }),
      );
    });

    it("path-2 skips the email when shouldSendEmail returns disallow (kill-switch)", async () => {
      mockAuth.mockResolvedValueOnce({ userId: CALLER });
      mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
      mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({
        id: "rel_1",
        childOrgId: "org_child_1",
        parentOrgId: "org_parent_1",
        subOrgName: "ACME Sub",
        subOrgStatus: "ACTIVE",
      });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ firstName: "André", lastName: null, email: null })
        .mockResolvedValueOnce({ preferredLanguage: "de", firstName: null, lastName: null })
        .mockResolvedValueOnce({
          emailNotifications: false,
          notificationPreferences: null,
        });
      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUserList: vi.fn().mockResolvedValueOnce({ data: [{ id: "user_existing" }] }),
        },
        organizations: { createOrganizationMembership: vi.fn().mockResolvedValue({}) },
      });

      const res = await invitePOST(
        makeReq({ email: "existing@example.com", role: "MEMBER", permissionSet: "READ_ONLY" }),
        { params: { id: "rel_1" } },
      );
      expect(res.status).toBe(200);
      expect(mockSendBrandedEmail).not.toHaveBeenCalled();
    });

    it("path-1 sends the new-email template even though no User row exists yet", async () => {
      mockAuth.mockResolvedValueOnce({ userId: CALLER });
      mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
      mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({
        id: "rel_1",
        childOrgId: "org_child_1",
        parentOrgId: "org_parent_1",
        subOrgName: "ACME Sub",
        subOrgStatus: "ACTIVE",
      });
      // Inviter row only.
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        firstName: "André",
        lastName: "Bäcker",
        email: null,
      });
      mockClerkClient.mockResolvedValueOnce({
        users: { getUserList: vi.fn().mockResolvedValueOnce({ data: [] }) },
        organizations: {
          createOrganizationInvitation: vi.fn().mockResolvedValueOnce({
            id: "inv_x",
            emailAddress: "new@example.com",
            status: "pending",
          }),
        },
      });

      const res = await invitePOST(
        makeReq({ email: "new@example.com", role: "VIEWER" }),
        { params: { id: "rel_1" } },
      );
      expect(res.status).toBe(200);
      expect(mockSendBrandedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: "sub-org-member-invited-new",
          orgId: "org_parent_1",
          subOrgId: "org_child_1",
          userId: null,
          to: "new@example.com",
          data: expect.objectContaining({
            locale: "de",
            inviterName: "André Bäcker",
            subOrgName: "ACME Sub",
            role: "VIEWER",
          }),
        }),
      );
    });

    it("email-send failure does not break the API contract (200 still returned)", async () => {
      mockAuth.mockResolvedValueOnce({ userId: CALLER });
      mockPrisma.subOrgMembership.findUnique.mockResolvedValueOnce(FULL_ACCESS_OWNER);
      mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({
        id: "rel_1",
        childOrgId: "org_child_1",
        parentOrgId: "org_parent_1",
        subOrgName: "ACME Sub",
        subOrgStatus: "ACTIVE",
      });
      mockSendBrandedEmail.mockRejectedValueOnce(new Error("Resend down"));
      mockClerkClient.mockResolvedValueOnce({
        users: { getUserList: vi.fn().mockResolvedValueOnce({ data: [] }) },
        organizations: {
          createOrganizationInvitation: vi.fn().mockResolvedValueOnce({
            id: "inv_x",
            emailAddress: "new@example.com",
            status: "pending",
          }),
        },
      });

      const res = await invitePOST(
        makeReq({ email: "new@example.com" }),
        { params: { id: "rel_1" } },
      );
      expect(res.status).toBe(200);
    });
  });
});
