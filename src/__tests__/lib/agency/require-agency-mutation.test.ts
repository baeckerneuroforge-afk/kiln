/**
 * Sprint 20.1 — Tests for the OWNER/ADMIN-only mutation gate.
 *
 * The 6 mutating routes that adopted requireAgencyMutation
 * (/[id] DELETE, branding PATCH, members DELETE, industry-pack/refresh
 * POST, modules toggle POST, modules configure POST) all funnel
 * through this helper. Testing the helper end-to-end across the four
 * role buckets (OWNER, ADMIN, CONSULTANT, VIEWER) covers the RBAC
 * contract for every route at once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));

const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findFirst: vi.fn() },
  agencyMembership: { findUnique: vi.fn() },
  agencyMemberSubOrgAccess: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { requireAgencyMutation } from "@/lib/agency/require-agency-mutation";

const REL_ID = "rel_42";
const AGENCY_ORG_ID = "org_agency";
const USER_ID = "user_alice";

const SAMPLE_RELATIONSHIP = {
  id: REL_ID,
  parentOrgId: AGENCY_ORG_ID,
  childOrgId: "org_child",
  createdBy: USER_ID,
  subOrgName: "Acme",
  subOrgStatus: "ACTIVE",
  createdAt: new Date("2026-05-01"),
};

function withMembership(role: "OWNER" | "ADMIN" | "CONSULTANT" | "VIEWER") {
  mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce({
    id: "agency_mem_" + role,
    agencyClerkOrgId: AGENCY_ORG_ID,
    userId: USER_ID,
    role,
    invitedById: null,
    invitedAt: null,
    acceptedAt: new Date("2026-05-01"),
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-01"),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: USER_ID, orgId: AGENCY_ORG_ID });
  mockPrisma.orgRelationship.findFirst.mockResolvedValue(SAMPLE_RELATIONSHIP);
});

describe("Sprint 20.1 — requireAgencyMutation", () => {
  it("allows OWNER", async () => {
    withMembership("OWNER");
    const result = await requireAgencyMutation(REL_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.relationship.id).toBe(REL_ID);
    expect(result.membership.role).toBe("OWNER");
  });

  it("allows ADMIN", async () => {
    withMembership("ADMIN");
    const result = await requireAgencyMutation(REL_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.membership.role).toBe("ADMIN");
  });

  it("blocks CONSULTANT with 403 + INSUFFICIENT_AGENCY_ROLE", async () => {
    withMembership("CONSULTANT");
    const result = await requireAgencyMutation(REL_ID);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked");
    expect(result.response.status).toBe(403);
    const body = await result.response.json();
    expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
  });

  it("blocks VIEWER with 403", async () => {
    withMembership("VIEWER");
    const result = await requireAgencyMutation(REL_ID);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked");
    expect(result.response.status).toBe(403);
  });

  it("blocks a Clerk-org admin with no AgencyMembership row (403, not 401)", async () => {
    // No withMembership() call → findUnique returns null. Anyone who
    // wandered into the agency-org context via Clerk org-admin status
    // but never accepted the KILN-side invite must be rejected here,
    // not silently treated as an OWNER.
    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(null);
    const result = await requireAgencyMutation(REL_ID);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked");
    expect(result.response.status).toBe(403);
    const body = await result.response.json();
    expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
  });

  it("propagates 401 from requireSubOrgAccess when caller is unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
    const result = await requireAgencyMutation(REL_ID);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked");
    expect(result.response.status).toBe(401);
    // Should not have hit the agency-membership lookup at all.
    expect(mockPrisma.agencyMembership.findUnique).not.toHaveBeenCalled();
  });

  it("propagates 400 when there's no active org context", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID, orgId: null });
    const result = await requireAgencyMutation(REL_ID);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked");
    expect(result.response.status).toBe(400);
  });

  it("propagates 404 when the relationship is in a different agency", async () => {
    // requireSubOrgAccess scopes findFirst by parentOrgId — null here
    // means "exists but not under this agency, OR doesn't exist". Both
    // collapse to 404 to prevent ID-probing.
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce(null);
    const result = await requireAgencyMutation(REL_ID);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked");
    expect(result.response.status).toBe(404);
  });

  it("does not leak the caller's actual role in the 403 body", async () => {
    // Defense-in-depth — both CONSULTANT and "no membership" produce
    // the same error envelope. A probing client cannot enumerate roles.
    withMembership("CONSULTANT");
    const consultantRes = await requireAgencyMutation(REL_ID);
    if (consultantRes.ok) throw new Error("expected blocked");
    const consultantBody = await consultantRes.response.json();

    mockPrisma.agencyMembership.findUnique.mockResolvedValueOnce(null);
    const noMemRes = await requireAgencyMutation(REL_ID);
    if (noMemRes.ok) throw new Error("expected blocked");
    const noMemBody = await noMemRes.response.json();

    expect(consultantBody).toEqual(noMemBody);
    expect(JSON.stringify(consultantBody)).not.toContain("CONSULTANT");
  });
});
