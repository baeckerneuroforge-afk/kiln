/**
 * Sprint 19.8 — POST /verify + DELETE on /api/sub-orgs/[id]/domains/[domainId].
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetMembership = vi.hoisted(() => vi.fn());
const mockVerify = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  customDomain: { findUnique: vi.fn() },
}));
const mockCacheDelete = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/permissions/sub-org-permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permissions/sub-org-permissions")>(
    "@/lib/permissions/sub-org-permissions",
  );
  return {
    ...actual,
    getUserSubOrgMembership: mockGetMembership,
  };
});
vi.mock("@/lib/domains/domain-manager", () => ({
  verifyDomain: mockVerify,
  removeCustomDomain: mockRemove,
}));
vi.mock("@/lib/domains/hostname-cache", () => ({
  getDefaultHostnameCache: () => ({ delete: mockCacheDelete }),
}));

import { POST as verifyPOST } from "@/app/api/sub-orgs/[id]/domains/[domainId]/verify/route";
import { DELETE as deleteDELETE } from "@/app/api/sub-orgs/[id]/domains/[domainId]/route";

const SUB_ORG = "sub_1";
const CALLER = "user_caller";
const DOMAIN_ID = "dom_1";

const OWNER = {
  id: "mem_1",
  subOrgId: SUB_ORG,
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
  mockGetMembership.mockReset();
  mockVerify.mockReset();
  mockRemove.mockReset();
  mockPrisma.customDomain.findUnique.mockReset();
  mockCacheDelete.mockReset();
});

function makeReq() {
  return new Request("http://localhost", { method: "POST" });
}

function makeDelReq() {
  return new Request("http://localhost", { method: "DELETE" });
}

describe("POST /verify", () => {
  it("404 when caller has no membership", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(null);
    const res = await verifyPOST(makeReq(), {
      params: { id: SUB_ORG, domainId: DOMAIN_ID },
    });
    expect(res.status).toBe(404);
  });

  it("404 when domain belongs to a different sub-org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER);
    mockPrisma.customDomain.findUnique.mockResolvedValueOnce({
      id: DOMAIN_ID,
      subOrgId: "sub_other",
      hostname: "ai.x.de",
    });
    const res = await verifyPOST(makeReq(), {
      params: { id: SUB_ORG, domainId: DOMAIN_ID },
    });
    expect(res.status).toBe(404);
  });

  it("re-verifies via manager + clears the hostname cache + returns the new status", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER);
    mockPrisma.customDomain.findUnique.mockResolvedValueOnce({
      id: DOMAIN_ID,
      subOrgId: SUB_ORG,
      hostname: "ai.x.de",
    });
    mockVerify.mockResolvedValueOnce({
      ok: true,
      domain: {
        id: DOMAIN_ID,
        hostname: "ai.x.de",
        status: "ACTIVE",
        sslStatus: "ISSUED",
        sslIssuedAt: new Date(),
      },
    });
    const res = await verifyPOST(makeReq(), {
      params: { id: SUB_ORG, domainId: DOMAIN_ID },
    });
    expect(res.status).toBe(200);
    expect(mockCacheDelete).toHaveBeenCalledWith("ai.x.de");
    const body = await res.json();
    expect(body.status).toBe("ACTIVE");
  });

  it("502 surfaces a Vercel error message", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER);
    mockPrisma.customDomain.findUnique.mockResolvedValueOnce({
      id: DOMAIN_ID,
      subOrgId: SUB_ORG,
      hostname: "ai.x.de",
    });
    mockVerify.mockResolvedValueOnce({
      ok: false,
      error: "verification failed",
      code: "verify_failed",
    });
    const res = await verifyPOST(makeReq(), {
      params: { id: SUB_ORG, domainId: DOMAIN_ID },
    });
    expect(res.status).toBe(502);
  });
});

describe("DELETE /domains/[domainId]", () => {
  it("removes the domain + invalidates the cache", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER);
    mockPrisma.customDomain.findUnique.mockResolvedValueOnce({
      id: DOMAIN_ID,
      subOrgId: SUB_ORG,
      hostname: "ai.x.de",
    });
    mockRemove.mockResolvedValueOnce({ ok: true });
    const res = await deleteDELETE(makeDelReq(), {
      params: { id: SUB_ORG, domainId: DOMAIN_ID },
    });
    expect(res.status).toBe(200);
    expect(mockCacheDelete).toHaveBeenCalledWith("ai.x.de");
  });

  it("404 cross-tenant", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER);
    mockPrisma.customDomain.findUnique.mockResolvedValueOnce({
      id: DOMAIN_ID,
      subOrgId: "sub_other",
      hostname: "ai.x.de",
    });
    const res = await deleteDELETE(makeDelReq(), {
      params: { id: SUB_ORG, domainId: DOMAIN_ID },
    });
    expect(res.status).toBe(404);
  });
});
