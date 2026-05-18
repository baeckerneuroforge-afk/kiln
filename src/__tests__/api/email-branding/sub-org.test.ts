import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgencyRole } from "@prisma/client";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    orgRelationship: { findFirst: vi.fn(), update: vi.fn() },
    agencyMembership: { findUnique: vi.fn() },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET, PATCH } from "@/app/api/email-branding/sub-org/[id]/route";

const REL_ID = "rel_1";
const AGENCY_ORG_ID = "agency_x";
const CHILD_ORG_ID = "child_x";
const USER_ID = "user_1";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
  mockRelationship();
  mockAgencyRole("OWNER");
  prismaMock.orgRelationship.update.mockResolvedValue({
    emailBrandOverride: { brandName: "Customer X" },
  });
});

function makeGetRequest() {
  return new Request("https://x.test/api/email-branding/sub-org/rel_1");
}

function makePatchRequest(body: unknown) {
  return new Request("https://x.test/api/email-branding/sub-org/rel_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockRelationship(emailBrandOverride: unknown = null) {
  prismaMock.orgRelationship.findFirst.mockResolvedValue({
    id: REL_ID,
    parentOrgId: AGENCY_ORG_ID,
    childOrgId: CHILD_ORG_ID,
    emailBrandOverride,
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

describe("GET /api/email-branding/sub-org/[id]", () => {
  it("returns 401 when the caller is not signed in", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });

    const res = await GET(makeGetRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(401);
    expect(prismaMock.orgRelationship.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the relationship belongs to a different agency", async () => {
    prismaMock.orgRelationship.findFirst.mockResolvedValue(null);

    const res = await GET(makeGetRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(404);
    expect(prismaMock.agencyMembership.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller has no AgencyMembership", async () => {
    prismaMock.agencyMembership.findUnique.mockResolvedValue(null);

    const res = await GET(makeGetRequest(), { params: { id: REL_ID } });

    expect(res.status).toBe(404);
  });

  it("returns 403 for VIEWER", async () => {
    mockAgencyRole("VIEWER");

    const res = await GET(makeGetRequest(), { params: { id: REL_ID } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
  });

  it.each<AgencyRole>(["OWNER", "ADMIN", "CONSULTANT"])(
    "allows %s to read the override",
    async (role) => {
      mockRelationship({ brandName: "Customer X", brandColor: "#123456" });
      mockAgencyRole(role);

      const res = await GET(makeGetRequest(), { params: { id: REL_ID } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        enabled: true,
        override: { brandName: "Customer X", brandColor: "#123456" },
      });
    },
  );
});

describe("PATCH /api/email-branding/sub-org/[id]", () => {
  it("returns 401 when the caller is not signed in", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });

    const res = await PATCH(makePatchRequest({ brandName: "X" }), {
      params: { id: REL_ID },
    });

    expect(res.status).toBe(401);
    expect(prismaMock.orgRelationship.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.orgRelationship.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the relationship belongs to a different agency", async () => {
    prismaMock.orgRelationship.findFirst.mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ brandName: "X" }), {
      params: { id: REL_ID },
    });

    expect(res.status).toBe(404);
    expect(prismaMock.agencyMembership.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.orgRelationship.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller has no AgencyMembership", async () => {
    prismaMock.agencyMembership.findUnique.mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ brandName: "X" }), {
      params: { id: REL_ID },
    });

    expect(res.status).toBe(404);
    expect(prismaMock.orgRelationship.update).not.toHaveBeenCalled();
  });

  it.each<AgencyRole>(["CONSULTANT", "VIEWER"])(
    "returns 403 for %s",
    async (role) => {
      mockAgencyRole(role);

      const res = await PATCH(makePatchRequest({ brandName: "X" }), {
        params: { id: REL_ID },
      });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
      expect(prismaMock.orgRelationship.update).not.toHaveBeenCalled();
    },
  );

  it.each<AgencyRole>(["OWNER", "ADMIN"])(
    "allows %s to update the override",
    async (role) => {
      mockAgencyRole(role);

      const res = await PATCH(makePatchRequest({ brandName: "Customer X" }), {
        params: { id: REL_ID },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        enabled: true,
        override: { brandName: "Customer X" },
      });
      expect(prismaMock.orgRelationship.update).toHaveBeenCalledWith({
        where: { id: REL_ID },
        data: { emailBrandOverride: { brandName: "Customer X" } },
        select: { emailBrandOverride: true },
      });
    },
  );

  it("clears the override when enabled=false", async () => {
    const res = await PATCH(makePatchRequest({ enabled: false }), {
      params: { id: REL_ID },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(prismaMock.orgRelationship.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailBrandOverride: expect.anything(),
        }),
      }),
    );
  });

  it("rejects invalid brandColor with 400", async () => {
    const res = await PATCH(makePatchRequest({ brandColor: "not-a-hex" }), {
      params: { id: REL_ID },
    });

    expect(res.status).toBe(400);
    expect(prismaMock.orgRelationship.update).not.toHaveBeenCalled();
  });

  it("merges valid fields into existing override", async () => {
    mockRelationship({ brandName: "Old", brandColor: "#000000" });
    prismaMock.orgRelationship.update.mockResolvedValue({
      emailBrandOverride: {
        brandName: "Old",
        brandColor: "#000000",
        fromAddress: "x@y.com",
      },
    });

    const res = await PATCH(makePatchRequest({ fromAddress: "x@y.com" }), {
      params: { id: REL_ID },
    });

    expect(res.status).toBe(200);
    const updateCall = prismaMock.orgRelationship.update.mock.calls[0][0];
    expect(updateCall.data.emailBrandOverride).toMatchObject({
      brandName: "Old",
      brandColor: "#000000",
      fromAddress: "x@y.com",
    });
  });
});
