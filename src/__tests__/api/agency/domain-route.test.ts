/**
 * Sprint 19.8.1 — /api/agency/domain GET + POST + DELETE + verify.
 *
 * Auth model:
 *   GET: any agency member (sub-orgs.read)
 *   POST: OWNER only
 *   POST verify: OWNER + ADMIN
 *   DELETE: OWNER only
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetMembership = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockList = vi.hoisted(() => vi.fn());
const mockVerify = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());
const mockCacheDelete = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agencyDomain: { findUnique: vi.fn() },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/permissions/agency-permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permissions/agency-permissions")>(
    "@/lib/permissions/agency-permissions",
  );
  return {
    ...actual,
    getAgencyMembership: mockGetMembership,
  };
});
vi.mock("@/lib/domains/agency-domain-manager", () => ({
  createAgencyDomain: mockCreate,
  listAgencyDomains: mockList,
  verifyAgencyDomain: mockVerify,
  removeAgencyDomain: mockRemove,
}));
vi.mock("@/lib/domains/hostname-cache", () => ({
  getDefaultHostnameCache: () => ({ delete: mockCacheDelete }),
}));

import { GET, POST } from "@/app/api/agency/domain/route";
import { DELETE as deleteDomain } from "@/app/api/agency/domain/[domainId]/route";
import { POST as verifyPOST } from "@/app/api/agency/domain/[domainId]/verify/route";

const AGENCY_ORG = "org_agency_1";
const CALLER = "user_caller";

function ownerRow() {
  return {
    id: "am_owner",
    agencyClerkOrgId: AGENCY_ORG,
    userId: CALLER,
    role: "OWNER" as const,
    invitedById: null,
    invitedAt: null,
    acceptedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
function adminRow() {
  return { ...ownerRow(), id: "am_admin", role: "ADMIN" as const };
}
function consultantRow() {
  return { ...ownerRow(), id: "am_consultant", role: "CONSULTANT" as const };
}

beforeEach(() => {
  mockAuth.mockReset();
  mockGetMembership.mockReset();
  mockCreate.mockReset();
  mockList.mockReset();
  mockVerify.mockReset();
  mockRemove.mockReset();
  mockCacheDelete.mockReset();
  mockPrisma.agencyDomain.findUnique.mockReset();
});

describe("GET /api/agency/domain", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("400 when no active organization", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: null });
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("404 when caller is not an agency member", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("returns the domain + canManage=true / canVerify=true for OWNERs", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(ownerRow());
    mockList.mockResolvedValueOnce([
      {
        id: "agd_1",
        hostname: "agency.de",
        status: "ACTIVE",
        sslStatus: "ISSUED",
        sslIssuedAt: new Date(),
        isPrimary: true,
        createdAt: new Date(),
        agencyOrgId: AGENCY_ORG,
        updatedAt: new Date(),
        vercelDomainId: "vd_1",
        verificationToken: null,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canManage).toBe(true);
    expect(body.canVerify).toBe(true);
    expect(body.domain.hostname).toBe("agency.de");
  });

  it("returns canManage=false for ADMIN, canVerify=true", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(adminRow());
    mockList.mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canManage).toBe(false);
    expect(body.canVerify).toBe(true);
  });

  it("returns canManage=false + canVerify=false for CONSULTANT", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(consultantRow());
    mockList.mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canManage).toBe(false);
    expect(body.canVerify).toBe(false);
  });
});

function postReq(body: unknown) {
  return new Request("http://localhost/api/agency/domain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agency/domain", () => {
  it("403 for ADMIN (POST is OWNER-only)", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(adminRow());
    const res = await POST(postReq({ hostname: "agency.de" }));
    expect(res.status).toBe(403);
  });

  it("400 when hostname is missing", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(ownerRow());
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it("409 when manager returns hostname_taken", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(ownerRow());
    mockCreate.mockResolvedValueOnce({
      ok: false,
      error: "taken",
      code: "hostname_taken",
    });
    const res = await POST(postReq({ hostname: "x.de" }));
    expect(res.status).toBe(409);
  });

  it("409 when manager returns agency_domain_exists", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(ownerRow());
    mockCreate.mockResolvedValueOnce({
      ok: false,
      error: "exists",
      code: "agency_domain_exists",
    });
    const res = await POST(postReq({ hostname: "x.de" }));
    expect(res.status).toBe(409);
  });

  it("happy path returns hostname + CNAME dnsHint for sub-domain", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(ownerRow());
    mockCreate.mockResolvedValueOnce({
      ok: true,
      domain: { id: "agd_new", hostname: "ai.agency.de", status: "VERIFYING" },
      verification: [],
    });
    const res = await POST(postReq({ hostname: "ai.agency.de" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hostname).toBe("ai.agency.de");
    expect(body.dnsHint.type).toBe("CNAME");
    expect(body.dnsHint.value).toBe("cname.vercel-dns.com");
  });

  it("returns A-record hint for apex domains", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(ownerRow());
    mockCreate.mockResolvedValueOnce({
      ok: true,
      domain: { id: "agd_new", hostname: "agency.de", status: "VERIFYING" },
      verification: [],
    });
    const res = await POST(postReq({ hostname: "agency.de" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dnsHint.type).toBe("A");
  });
});

describe("DELETE /api/agency/domain/[domainId]", () => {
  it("403 when caller is ADMIN", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(adminRow());
    const res = await deleteDomain(new Request("http://localhost", { method: "DELETE" }), {
      params: { domainId: "agd_1" },
    });
    expect(res.status).toBe(403);
  });

  it("404 when cross-tenant", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(ownerRow());
    mockPrisma.agencyDomain.findUnique.mockResolvedValueOnce({
      id: "agd_1",
      agencyOrgId: "org_other",
      hostname: "agency.de",
    });
    const res = await deleteDomain(new Request("http://localhost", { method: "DELETE" }), {
      params: { domainId: "agd_1" },
    });
    expect(res.status).toBe(404);
  });

  it("happy path removes and invalidates cache", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(ownerRow());
    mockPrisma.agencyDomain.findUnique.mockResolvedValueOnce({
      id: "agd_1",
      agencyOrgId: AGENCY_ORG,
      hostname: "agency.de",
    });
    mockRemove.mockResolvedValueOnce({ ok: true });
    const res = await deleteDomain(new Request("http://localhost", { method: "DELETE" }), {
      params: { domainId: "agd_1" },
    });
    expect(res.status).toBe(200);
    expect(mockCacheDelete).toHaveBeenCalledWith("agency.de");
  });
});

describe("POST /api/agency/domain/[domainId]/verify", () => {
  it("OWNER + ADMIN may call; 403 for CONSULTANT", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(consultantRow());
    const res = await verifyPOST(new Request("http://localhost", { method: "POST" }), {
      params: { domainId: "agd_1" },
    });
    expect(res.status).toBe(403);
  });

  it("happy path refreshes status + clears cache", async () => {
    mockAuth.mockResolvedValue({ userId: CALLER, orgId: AGENCY_ORG });
    mockGetMembership.mockResolvedValueOnce(adminRow());
    mockPrisma.agencyDomain.findUnique.mockResolvedValueOnce({
      id: "agd_1",
      agencyOrgId: AGENCY_ORG,
      hostname: "agency.de",
    });
    mockVerify.mockResolvedValueOnce({
      ok: true,
      domain: {
        id: "agd_1",
        hostname: "agency.de",
        status: "ACTIVE",
        sslStatus: "ISSUED",
        sslIssuedAt: new Date(),
      },
    });
    const res = await verifyPOST(new Request("http://localhost", { method: "POST" }), {
      params: { domainId: "agd_1" },
    });
    expect(res.status).toBe(200);
    expect(mockCacheDelete).toHaveBeenCalledWith("agency.de");
    const body = await res.json();
    expect(body.status).toBe("ACTIVE");
  });
});
