/**
 * Domain CRUD smoke tests for /api/agency/branding/domain.
 *
 * Mocks both Clerk auth + the Vercel domain lib so the test exercises
 * the route's gating, validation, conflict handling, and compensation
 * logic without hitting either external API.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ADMIN_ENV = process.env.ADMIN_USER_IDS;
const AGENCY_USER = "user_agency_domain_test";
const AGENCY_ORG = "org_agency_1";

beforeAll(() => {
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
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  orgRelationship: { count: vi.fn() },
  orgBranding: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
}));
const mockAddDomain = vi.hoisted(() => vi.fn());
const mockRemoveDomain = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/vercel/domains", () => ({
  addDomain: mockAddDomain,
  removeDomain: mockRemoveDomain,
}));

import { POST as domainPOST, DELETE as domainDELETE } from "@/app/api/agency/branding/domain/route";

function makePostReq(body: unknown) {
  return new Request("http://localhost/api/agency/branding/domain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agency/branding/domain", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockAddDomain.mockReset();
    mockRemoveDomain.mockReset();
    Object.values(mockPrisma).forEach((m) =>
      Object.values(m).forEach((fn) => fn.mockReset())
    );
  });

  it("401 without auth", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
    const res = await domainPOST(makePostReq({ domain: "example.com" }));
    expect(res.status).toBe(401);
  });

  it("400 without active org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: null });
    const res = await domainPOST(makePostReq({ domain: "example.com" }));
    expect(res.status).toBe(400);
  });

  it("403 when caller isn't agency-tier", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "PRO" });
    const res = await domainPOST(makePostReq({ domain: "example.com" }));
    expect(res.status).toBe(403);
  });

  it("400 when domain is missing", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    const res = await domainPOST(makePostReq({ domain: "" }));
    expect(res.status).toBe(400);
  });

  it("400 when domain has invalid format", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    const res = await domainPOST(makePostReq({ domain: "no spaces in domains" }));
    expect(res.status).toBe(400);
  });

  it("409 when another org already owns the domain", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.orgBranding.findFirst.mockResolvedValueOnce({
      orgId: "org_someone_else",
    });
    const res = await domainPOST(makePostReq({ domain: "taken.com" }));
    expect(res.status).toBe(409);
  });

  it("happy path: registers domain with Vercel and persists row", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.orgBranding.findFirst.mockResolvedValueOnce(null);
    mockAddDomain.mockResolvedValueOnce({
      name: "kunde.agentur.de",
      verified: false,
      verification: [
        { type: "CNAME", domain: "kunde.agentur.de", value: "cname.vercel-dns.com" },
      ],
    });
    mockPrisma.orgBranding.upsert.mockResolvedValueOnce({
      customDomain: "kunde.agentur.de",
      domainVerified: false,
    });

    const res = await domainPOST(makePostReq({ domain: "Kunde.Agentur.de" }));
    expect(res.status).toBe(200);
    // domain is lowercased before persistence + Vercel call.
    expect(mockAddDomain).toHaveBeenCalledWith("kunde.agentur.de");
    expect(mockPrisma.orgBranding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: AGENCY_ORG },
        create: expect.objectContaining({ customDomain: "kunde.agentur.de" }),
      })
    );

    const body = await res.json();
    expect(body).toMatchObject({
      domain: "kunde.agentur.de",
      verified: false,
    });
    expect(body.verification).toHaveLength(1);
  });

  it("compensates Vercel registration when DB write fails", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.orgBranding.findFirst.mockResolvedValueOnce(null);
    mockAddDomain.mockResolvedValueOnce({
      name: "kunde.agentur.de",
      verified: false,
      verification: [],
    });
    mockPrisma.orgBranding.upsert.mockRejectedValueOnce(new Error("DB down"));
    mockRemoveDomain.mockResolvedValueOnce(undefined);

    const res = await domainPOST(makePostReq({ domain: "kunde.agentur.de" }));
    expect(res.status).toBe(500);
    // The route called removeDomain to compensate the orphaned Vercel
    // registration so the operator can retry without "already in use".
    expect(mockRemoveDomain).toHaveBeenCalledWith("kunde.agentur.de");
  });

  it("502 when Vercel itself rejects", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.orgBranding.findFirst.mockResolvedValueOnce(null);
    mockAddDomain.mockRejectedValueOnce(new Error("Vercel: invalid hostname"));

    const res = await domainPOST(makePostReq({ domain: "kunde.agentur.de" }));
    expect(res.status).toBe(502);
  });
});

describe("DELETE /api/agency/branding/domain", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockAddDomain.mockReset();
    mockRemoveDomain.mockReset();
    Object.values(mockPrisma).forEach((m) =>
      Object.values(m).forEach((fn) => fn.mockReset())
    );
  });

  it("noop when no domain configured", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.orgBranding.findUnique.mockResolvedValueOnce({ customDomain: null });
    const res = await domainDELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBeNull();
  });

  it("clears the row even when Vercel removal fails (local-state-of-truth wins)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.orgBranding.findUnique.mockResolvedValueOnce({
      customDomain: "kunde.agentur.de",
    });
    mockRemoveDomain.mockRejectedValueOnce(new Error("Vercel: 500"));
    mockPrisma.orgBranding.update.mockResolvedValueOnce({});
    const res = await domainDELETE();
    expect(res.status).toBe(200);
    expect(mockPrisma.orgBranding.update).toHaveBeenCalled();
  });
});
