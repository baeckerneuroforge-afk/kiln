/**
 * Sprint 19.8 — /api/sub-orgs/[id]/domains GET + POST.
 *
 * Mirrors the auth model the rest of the sub-org membership-managing
 * endpoints use (Sprint 19.7.6.2). Tests verify the 4 auth branches
 * + the happy path + the validation 400/409.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetMembership = vi.hoisted(() => vi.fn());
const mockCreateDomain = vi.hoisted(() => vi.fn());
const mockListDomains = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
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
  createCustomDomain: mockCreateDomain,
  listDomainsForSubOrg: mockListDomains,
}));

import { GET, POST } from "@/app/api/sub-orgs/[id]/domains/route";

const SUB_ORG = "sub_1";
const CALLER = "user_caller";

const OWNER_MEMBERSHIP = {
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

const READ_ONLY_MEMBERSHIP = {
  ...OWNER_MEMBERSHIP,
  role: "MEMBER" as const,
  permissionSet: "READ_ONLY" as const,
};

beforeEach(() => {
  mockAuth.mockReset();
  mockGetMembership.mockReset();
  mockCreateDomain.mockReset();
  mockListDomains.mockReset();
});

function postReq(body: unknown) {
  return new Request(`http://localhost/api/sub-orgs/${SUB_ORG}/domains`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/sub-orgs/[id]/domains", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await GET(new Request("http://localhost"), { params: { id: SUB_ORG } });
    expect(res.status).toBe(401);
  });

  it("404 when caller has no membership", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost"), { params: { id: SUB_ORG } });
    expect(res.status).toBe(404);
  });

  it("returns the domain list + canManage=true for OWNERs", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockListDomains.mockResolvedValueOnce([
      {
        id: "dom_1",
        hostname: "ai.x.de",
        status: "ACTIVE",
        sslStatus: "ISSUED",
        sslIssuedAt: new Date(),
        isPrimary: true,
        createdAt: new Date(),
      },
    ]);
    const res = await GET(new Request("http://localhost"), { params: { id: SUB_ORG } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domains).toHaveLength(1);
    expect(body.canManage).toBe(true);
  });

  it("returns canManage=false for read-only members", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(READ_ONLY_MEMBERSHIP);
    mockListDomains.mockResolvedValueOnce([]);
    const res = await GET(new Request("http://localhost"), { params: { id: SUB_ORG } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canManage).toBe(false);
  });
});

describe("POST /api/sub-orgs/[id]/domains", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await POST(postReq({ hostname: "ai.x.de" }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(401);
  });

  it("404 when caller has no membership", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(null);
    const res = await POST(postReq({ hostname: "ai.x.de" }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(404);
  });

  it("403 when caller is a read-only member", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(READ_ONLY_MEMBERSHIP);
    const res = await POST(postReq({ hostname: "ai.x.de" }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(403);
  });

  it("400 when hostname is missing", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    const res = await POST(postReq({}), { params: { id: SUB_ORG } });
    expect(res.status).toBe(400);
  });

  it("400 with invalid_hostname when domain-manager rejects the input", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockCreateDomain.mockResolvedValueOnce({
      ok: false,
      error: "hostname is empty",
      code: "invalid_hostname",
    });
    const res = await POST(postReq({ hostname: "  " }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(400);
  });

  it("409 when hostname is taken by another sub-org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockCreateDomain.mockResolvedValueOnce({
      ok: false,
      error: "taken",
      code: "hostname_taken",
    });
    const res = await POST(postReq({ hostname: "ai.x.de" }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(409);
  });

  it("happy path returns hostname + dnsHint for a sub-domain (CNAME)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockCreateDomain.mockResolvedValueOnce({
      ok: true,
      domain: {
        id: "dom_new",
        hostname: "ai.muellergmbh.de",
        status: "VERIFYING",
      },
      verification: [{ type: "TXT", domain: "_vercel.ai.muellergmbh.de", value: "abc123", reason: "x" }],
    });
    const res = await POST(postReq({ hostname: "ai.muellergmbh.de" }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hostname).toBe("ai.muellergmbh.de");
    expect(body.dnsHint.type).toBe("CNAME");
    expect(body.dnsHint.value).toBe("cname.vercel-dns.com");
    expect(body.dnsHint.name).toBe("ai");
  });

  it("returns A-record dnsHint for apex domains", async () => {
    mockAuth.mockResolvedValueOnce({ userId: CALLER });
    mockGetMembership.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockCreateDomain.mockResolvedValueOnce({
      ok: true,
      domain: { id: "dom_apex", hostname: "muellergmbh.de", status: "VERIFYING" },
      verification: [],
    });
    const res = await POST(postReq({ hostname: "muellergmbh.de" }), { params: { id: SUB_ORG } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dnsHint.type).toBe("A");
    expect(body.dnsHint.value).toBe("76.76.21.21");
  });
});
