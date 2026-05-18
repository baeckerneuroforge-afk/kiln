import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgencyRole } from "@prisma/client";

const { authMock, mutationMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  mutationMock: vi.fn(),
  prismaMock: {
    orgRelationship: { findFirst: vi.fn() },
    agencyMembership: { findUnique: vi.fn() },
    orgBranding: { findUnique: vi.fn() },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/agency/require-agency-mutation", () => ({
  requireAgencyMutation: mutationMock,
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "@/app/api/agency/sub-orgs/[id]/branding/route";

const REL_ID = "rel_1";
const AGENCY_ORG_ID = "org_agency";
const CHILD_ORG_ID = "org_child";
const USER_ID = "user_1";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest() {
  return new Request("http://localhost/api/agency/sub-orgs/rel_1/branding");
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

describe("GET /api/agency/sub-orgs/[id]/branding", () => {
  it("returns 401 when the caller is not signed in", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(401);
    expect(prismaMock.orgRelationship.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.orgBranding.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the relationship belongs to a different agency", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    prismaMock.orgRelationship.findFirst.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(404);
    expect(prismaMock.agencyMembership.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.orgBranding.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller has no AgencyMembership", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockRelationship();
    prismaMock.agencyMembership.findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(404);
    expect(prismaMock.orgBranding.findUnique).not.toHaveBeenCalled();
  });

  it("returns 403 for VIEWER", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockRelationship();
    mockAgencyRole("VIEWER");

    const res = await GET(makeRequest(), { params: { id: REL_ID } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
    expect(prismaMock.orgBranding.findUnique).not.toHaveBeenCalled();
  });

  it.each<AgencyRole>(["OWNER", "ADMIN", "CONSULTANT"])(
    "allows %s to read branding",
    async (role) => {
      authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
      mockRelationship();
      mockAgencyRole(role);
      prismaMock.orgBranding.findUnique.mockResolvedValue(null);

      const res = await GET(makeRequest(), { params: { id: REL_ID } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        logoUrl: null,
        primaryColor: null,
        showAgencyLogo: true,
        agencyName: null,
        customDomain: null,
        domainVerified: false,
        domainVerifiedAt: null,
      });
      expect(prismaMock.orgBranding.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { orgId: CHILD_ORG_ID } }),
      );
    },
  );

  it("maps an existing branding row into the response", async () => {
    authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockRelationship();
    mockAgencyRole("OWNER");
    prismaMock.orgBranding.findUnique.mockResolvedValue({
      logoUrl: "https://cdn.example.com/logo.png",
      primaryColor: "#2F6FED",
      showAgencyLogo: false,
      agencyName: "Customer X",
      customDomain: "mail.customer.example",
      domainVerified: true,
      domainVerifiedAt: new Date("2026-05-01T10:00:00Z"),
    });

    const res = await GET(makeRequest(), { params: { id: REL_ID } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      logoUrl: "https://cdn.example.com/logo.png",
      primaryColor: "#2F6FED",
      showAgencyLogo: false,
      agencyName: "Customer X",
      customDomain: "mail.customer.example",
      domainVerified: true,
      domainVerifiedAt: "2026-05-01T10:00:00.000Z",
    });
  });
});
