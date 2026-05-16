/**
 * Sprint 19.7.1 — clerk webhook organizationMembership handlers.
 *
 * Svix signature verification is patched out via vi.mock; the focus
 * is on the new sub-org membership handlers.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockVerify = vi.hoisted(() => vi.fn());
const mockClerkClient = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findUnique: vi.fn() },
  subOrgMembership: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: { findUnique: vi.fn(), upsert: vi.fn() },
}));

vi.mock("svix", () => ({
  Webhook: class {
    verify = mockVerify;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: mockClerkClient }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

process.env.CLERK_WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET ?? "whsec_test";

import { POST as clerkWebhookPOST } from "@/app/api/webhooks/clerk/route";

beforeEach(() => {
  mockVerify.mockReset();
  mockClerkClient.mockReset();
  mockPrisma.orgRelationship.findUnique.mockReset();
  mockPrisma.subOrgMembership.upsert.mockReset();
  mockPrisma.subOrgMembership.updateMany.mockReset();
  mockPrisma.subOrgMembership.deleteMany.mockReset();
});

function makeRequest() {
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: {
      "svix-id": "1",
      "svix-timestamp": "2",
      "svix-signature": "v1,sig",
    },
    body: JSON.stringify({}),
  }) as unknown as Parameters<typeof clerkWebhookPOST>[0];
}

function subOrgEvent(
  type: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    type,
    data: {
      id: "orgmem_1",
      organization: {
        id: "org_child_clerk_1",
        public_metadata: { kiln_type: "sub_org", parentAgencyOrgId: "org_agency_1" },
      },
      public_user_data: {
        user_id: "user_invited",
        identifier: "invitee@example.com",
      },
      role: "org:member",
      ...overrides,
    },
  };
}

describe("organizationMembership.created", () => {
  it("skips non-sub-org events (no kiln_type=sub_org metadata)", async () => {
    mockVerify.mockReturnValueOnce({
      type: "organizationMembership.created",
      data: {
        organization: { id: "org_personal", public_metadata: {} },
        public_user_data: { user_id: "user_x" },
        role: "org:admin",
      },
    });
    const res = await clerkWebhookPOST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockPrisma.orgRelationship.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.subOrgMembership.upsert).not.toHaveBeenCalled();
  });

  it("upserts a SubOrgMembership for sub-org events; defaults to USE_AGENTS when no invitation found (Sprint 20.1 — aligned with JIT-resolver)", async () => {
    mockVerify.mockReturnValueOnce(subOrgEvent("organizationMembership.created"));
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({ id: "sub_1" });
    mockClerkClient.mockResolvedValueOnce({
      organizations: {
        getOrganizationInvitationList: vi.fn().mockResolvedValueOnce({ data: [] }),
      },
    });

    const res = await clerkWebhookPOST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockPrisma.subOrgMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subOrgId_userId: { subOrgId: "sub_1", userId: "user_invited" } },
        create: expect.objectContaining({
          subOrgId: "sub_1",
          userId: "user_invited",
          role: "MEMBER",
          // Sprint 20.1 — Default permissionSet was READ_ONLY, now
          // USE_AGENTS so members can immediately use existing agents.
          // Inviters can still pin READ_ONLY via invitation publicMetadata
          // (see next test case for the override path).
          permissionSet: "USE_AGENTS",
        }),
      }),
    );
  });

  it("carries permissionSet + kilnRole from invitation publicMetadata", async () => {
    mockVerify.mockReturnValueOnce(subOrgEvent("organizationMembership.created"));
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({ id: "sub_1" });
    mockClerkClient.mockResolvedValueOnce({
      organizations: {
        getOrganizationInvitationList: vi.fn().mockResolvedValueOnce({
          data: [
            {
              emailAddress: "invitee@example.com",
              publicMetadata: {
                kilnRole: "ADMIN",
                permissionSet: "USE_AGENTS_PLUS_KNOWLEDGE",
              },
            },
          ],
        }),
      },
    });

    await clerkWebhookPOST(makeRequest());
    expect(mockPrisma.subOrgMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          role: "ADMIN",
          permissionSet: "USE_AGENTS_PLUS_KNOWLEDGE",
        }),
      }),
    );
  });

  it("skips when the Clerk org id does not map to a known OrgRelationship", async () => {
    mockVerify.mockReturnValueOnce(subOrgEvent("organizationMembership.created"));
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce(null);
    const res = await clerkWebhookPOST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockPrisma.subOrgMembership.upsert).not.toHaveBeenCalled();
  });
});

describe("organizationMembership.updated", () => {
  it("syncs role for sub-org events but never downgrades OWNER", async () => {
    mockVerify.mockReturnValueOnce(
      subOrgEvent("organizationMembership.updated", {
        public_user_data: { user_id: "user_demoted" },
        role: "org:member",
      }),
    );
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({ id: "sub_1" });

    const res = await clerkWebhookPOST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockPrisma.subOrgMembership.updateMany).toHaveBeenCalledWith({
      where: { subOrgId: "sub_1", userId: "user_demoted", role: { not: "OWNER" } },
      data: { role: "MEMBER" },
    });
  });

  it("maps org:admin to ADMIN", async () => {
    mockVerify.mockReturnValueOnce(
      subOrgEvent("organizationMembership.updated", {
        public_user_data: { user_id: "user_promoted" },
        role: "org:admin",
      }),
    );
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({ id: "sub_1" });

    await clerkWebhookPOST(makeRequest());
    expect(mockPrisma.subOrgMembership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "ADMIN" } }),
    );
  });
});

describe("organizationMembership.deleted", () => {
  it("removes the SubOrgMembership row for sub-org events", async () => {
    mockVerify.mockReturnValueOnce(
      subOrgEvent("organizationMembership.deleted", {
        public_user_data: { user_id: "user_gone" },
      }),
    );
    mockPrisma.orgRelationship.findUnique.mockResolvedValueOnce({ id: "sub_1" });

    const res = await clerkWebhookPOST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockPrisma.subOrgMembership.deleteMany).toHaveBeenCalledWith({
      where: { subOrgId: "sub_1", userId: "user_gone" },
    });
  });

  it("skips deletion when the event is not a sub-org event", async () => {
    mockVerify.mockReturnValueOnce({
      type: "organizationMembership.deleted",
      data: {
        organization: { id: "org_other", public_metadata: { kiln_type: "agency" } },
        public_user_data: { user_id: "user_gone" },
        role: "org:member",
      },
    });
    const res = await clerkWebhookPOST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockPrisma.subOrgMembership.deleteMany).not.toHaveBeenCalled();
  });
});
