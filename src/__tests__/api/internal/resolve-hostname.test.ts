/**
 * Sprint 19.8.1 — /api/internal/resolve-hostname returns either
 * sub-org, agency, or not-found, with sub-org precedence when both
 * tables would match (sub-org override on agency domain).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockResolveSubOrg = vi.hoisted(() => vi.fn());
const mockResolveAgency = vi.hoisted(() => vi.fn());

vi.mock("@/lib/domains/domain-manager", () => ({
  resolveSubOrgIdForHostname: mockResolveSubOrg,
}));
vi.mock("@/lib/domains/agency-domain-manager", () => ({
  resolveAgencyOrgIdForHostname: mockResolveAgency,
}));

import { GET } from "@/app/api/internal/resolve-hostname/route";

function req(hostname?: string) {
  const url = new URL("http://localhost/api/internal/resolve-hostname");
  if (hostname !== undefined) url.searchParams.set("hostname", hostname);
  return new Request(url.toString());
}

beforeEach(() => {
  mockResolveSubOrg.mockReset();
  mockResolveAgency.mockReset();
});

describe("GET /api/internal/resolve-hostname", () => {
  it("returns found=false for missing hostname param", async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(body).toEqual({ found: false });
  });

  it("returns found=false for syntactically-bogus hostnames without calling resolvers", async () => {
    const res = await GET(req("!@#$"));
    const body = await res.json();
    expect(body).toEqual({ found: false });
    expect(mockResolveSubOrg).not.toHaveBeenCalled();
    expect(mockResolveAgency).not.toHaveBeenCalled();
  });

  it("returns type=sub-org when CustomDomain has the hostname", async () => {
    mockResolveSubOrg.mockResolvedValueOnce({
      subOrgId: "sub_1",
      status: "ACTIVE",
    });
    const res = await GET(req("sub.de"));
    const body = await res.json();
    expect(body).toEqual({
      found: true,
      type: "sub-org",
      subOrgId: "sub_1",
      status: "ACTIVE",
    });
    // Doesn't bother checking AgencyDomain — sub-org wins.
    expect(mockResolveAgency).not.toHaveBeenCalled();
  });

  it("returns type=agency when only AgencyDomain matches", async () => {
    mockResolveSubOrg.mockResolvedValueOnce(null);
    mockResolveAgency.mockResolvedValueOnce({
      agencyOrgId: "org_a",
      status: "ACTIVE",
    });
    const res = await GET(req("agency.de"));
    const body = await res.json();
    expect(body).toEqual({
      found: true,
      type: "agency",
      agencyOrgId: "org_a",
      status: "ACTIVE",
    });
  });

  it("sub-org wins over agency-domain when both match (override)", async () => {
    mockResolveSubOrg.mockResolvedValueOnce({
      subOrgId: "sub_override",
      status: "ACTIVE",
    });
    mockResolveAgency.mockResolvedValueOnce({
      agencyOrgId: "org_a",
      status: "ACTIVE",
    });
    const res = await GET(req("shared.de"));
    const body = await res.json();
    expect(body.type).toBe("sub-org");
    expect(mockResolveAgency).not.toHaveBeenCalled();
  });

  it("returns found=false when neither table matches", async () => {
    mockResolveSubOrg.mockResolvedValueOnce(null);
    mockResolveAgency.mockResolvedValueOnce(null);
    const res = await GET(req("nobody.de"));
    const body = await res.json();
    expect(body).toEqual({ found: false });
  });

  it("returns found=false (fail-soft) when sub-org lookup throws", async () => {
    mockResolveSubOrg.mockRejectedValueOnce(new Error("DB down"));
    const res = await GET(req("x.de"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ found: false });
  });
});
