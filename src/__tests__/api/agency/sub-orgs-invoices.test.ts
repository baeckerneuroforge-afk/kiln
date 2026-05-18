import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgencyRole } from "@prisma/client";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    orgRelationship: { findFirst: vi.fn() },
    agencyMembership: { findUnique: vi.fn() },
    subOrgInvoice: { findMany: vi.fn() },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "@/app/api/agency/sub-orgs/[id]/invoices/route";

const REL_ID = "rel_1";
const AGENCY_ORG_ID = "org_agency";
const CHILD_ORG_ID = "org_child";
const USER_ID = "user_1";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
  mockRelationship();
  mockAgencyRole("OWNER");
  prismaMock.subOrgInvoice.findMany.mockResolvedValue([]);
});

function makeRequest() {
  return new Request("http://localhost/api/agency/sub-orgs/rel_1/invoices");
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

describe("GET /api/agency/sub-orgs/[id]/invoices", () => {
  it("returns 401 when the caller is not signed in", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(401);
    expect(prismaMock.orgRelationship.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.subOrgInvoice.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the relationship belongs to a different agency", async () => {
    prismaMock.orgRelationship.findFirst.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(404);
    expect(prismaMock.agencyMembership.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.subOrgInvoice.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller has no AgencyMembership", async () => {
    prismaMock.agencyMembership.findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(404);
    expect(prismaMock.subOrgInvoice.findMany).not.toHaveBeenCalled();
  });

  it.each<AgencyRole>(["CONSULTANT", "VIEWER"])(
    "returns 403 for %s",
    async (role) => {
      mockAgencyRole(role);

      const res = await GET(makeRequest(), { params: { id: REL_ID } });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
      expect(prismaMock.subOrgInvoice.findMany).not.toHaveBeenCalled();
    },
  );

  it.each<AgencyRole>(["OWNER", "ADMIN"])(
    "allows %s to read invoices",
    async (role) => {
      mockAgencyRole(role);

      const res = await GET(makeRequest(), { params: { id: REL_ID } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ items: [] });
      expect(prismaMock.subOrgInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ subOrgId: CHILD_ORG_ID }) }),
      );
    },
  );

  it("maps invoice rows into the response shape", async () => {
    prismaMock.subOrgInvoice.findMany.mockResolvedValue([
      {
        id: "inv_1",
        stripeInvoiceId: "stripe_inv_1",
        amount: 4900,
        currency: "eur",
        status: "paid",
        invoiceType: "MONTHLY",
        invoiceDate: new Date("2026-05-01T10:00:00Z"),
        paidAt: new Date("2026-05-02T10:00:00Z"),
        pdfUrl: "https://stripe.example.com/inv_1.pdf",
        hostedInvoiceUrl: "https://stripe.example.com/inv_1",
      },
    ]);

    const res = await GET(makeRequest(), { params: { id: REL_ID } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toEqual([
      {
        id: "inv_1",
        stripeInvoiceId: "stripe_inv_1",
        amount: 4900,
        currency: "eur",
        status: "paid",
        type: "MONTHLY",
        invoiceDate: "2026-05-01T10:00:00.000Z",
        paidAt: "2026-05-02T10:00:00.000Z",
        pdfUrl: "https://stripe.example.com/inv_1.pdf",
        hostedInvoiceUrl: "https://stripe.example.com/inv_1",
      },
    ]);
  });
});
