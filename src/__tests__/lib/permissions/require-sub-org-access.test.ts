/**
 * Sprint 19.7.1 — requireSubOrgAccess middleware helper.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AgencyRole, PermissionSet } from "@prisma/client";

const mockAuth = vi.hoisted(() => vi.fn());
const mockSubOrgMembershipFindUnique = vi.hoisted(() => vi.fn());
const mockOrgRelationshipFindFirst = vi.hoisted(() => vi.fn());
const mockAgencyMembershipFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subOrgMembership: { findUnique: mockSubOrgMembershipFindUnique },
    orgRelationship: { findFirst: mockOrgRelationshipFindFirst },
    agencyMembership: { findUnique: mockAgencyMembershipFindUnique },
  },
}));

import { requireSubOrgAccess } from "@/lib/permissions/require-sub-org-access";

const SUB_ORG_ID = "sub_1";
const USER_ID = "user_1";
const AGENCY_ORG_ID = "org_agency";
const CHILD_ORG_ID = "org_child";

const baseMembership = {
  id: "mem_1",
  subOrgId: SUB_ORG_ID,
  userId: USER_ID,
  role: "MEMBER" as const,
  permissionSet: "READ_ONLY" as const,
  invitedById: null,
  invitedAt: null,
  acceptedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseRelationship = {
  id: SUB_ORG_ID,
  parentOrgId: AGENCY_ORG_ID,
  childOrgId: CHILD_ORG_ID,
  createdAt: new Date(),
  createdBy: USER_ID,
  subOrgName: "Acme",
  subOrgStatus: "ACTIVE" as const,
  pricingMode: "NONE" as const,
  monthlyPriceCents: null,
  setupFeeCents: null,
  pricingCurrency: "eur",
  trialDays: null,
  stripeProductId: null,
  stripeMonthlyPriceId: null,
  stripeSetupPriceId: null,
  industry: null,
  onboardedVia: "MANUAL" as const,
  onboardingDuration: null,
  onboardedAt: null,
  brandColor: null,
  logoUrl: null,
  customSubdomain: null,
  emailSignature: null,
  emailBrandOverride: null,
};

function agencyMembership(role: AgencyRole) {
  return {
    id: `agency_mem_${role}`,
    agencyClerkOrgId: AGENCY_ORG_ID,
    userId: USER_ID,
    role,
    invitedById: null,
    invitedAt: null,
    acceptedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function subOrgMembership(permissionSet: PermissionSet = "READ_ONLY") {
  return { ...baseMembership, permissionSet };
}

beforeEach(() => {
  mockAuth.mockReset();
  mockSubOrgMembershipFindUnique.mockReset();
  mockOrgRelationshipFindFirst.mockReset();
  mockAgencyMembershipFindUnique.mockReset();
});

describe("requireSubOrgAccess", () => {
  it("401 when caller is not authenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const result = await requireSubOrgAccess(SUB_ORG_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("404 when caller has no membership in the sub-org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID });
    mockSubOrgMembershipFindUnique.mockResolvedValueOnce(null);
    const result = await requireSubOrgAccess(SUB_ORG_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it("403 when caller is a member but lacks the requested permission", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID });
    mockSubOrgMembershipFindUnique.mockResolvedValueOnce(subOrgMembership("READ_ONLY"));
    const result = await requireSubOrgAccess(SUB_ORG_ID, "agents.write");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("returns the membership when allowed (no permission requested)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID });
    mockSubOrgMembershipFindUnique.mockResolvedValueOnce(baseMembership);
    const result = await requireSubOrgAccess(SUB_ORG_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe(USER_ID);
      expect(result.membership.subOrgId).toBe(SUB_ORG_ID);
    }
  });

  it("keeps the old positional permission signature working", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID });
    mockSubOrgMembershipFindUnique.mockResolvedValueOnce(
      subOrgMembership("FULL_ACCESS"),
    );
    const result = await requireSubOrgAccess(SUB_ORG_ID, "memberships.manage");
    expect(result.ok).toBe(true);
  });

  it("checks sub-org permissions through the options signature", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID });
    mockSubOrgMembershipFindUnique.mockResolvedValueOnce(
      subOrgMembership("FULL_ACCESS"),
    );
    const result = await requireSubOrgAccess(SUB_ORG_ID, {
      requiredSubOrgPermission: "workflows.write",
    });
    expect(result.ok).toBe(true);
  });

  it.each<AgencyRole>(["OWNER", "ADMIN", "CONSULTANT"])(
    "allows agency-mode %s when the role is in the required set",
    async (role) => {
      mockAuth.mockResolvedValueOnce({ userId: USER_ID, orgId: AGENCY_ORG_ID });
      mockOrgRelationshipFindFirst.mockResolvedValueOnce(baseRelationship);
      mockAgencyMembershipFindUnique.mockResolvedValueOnce(agencyMembership(role));

      const result = await requireSubOrgAccess(SUB_ORG_ID, {
        requiredAgencyRole: ["OWNER", "ADMIN", "CONSULTANT"],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.relationship.id).toBe(SUB_ORG_ID);
        expect(result.agencyMembership.role).toBe(role);
        expect(result.agencyOrgId).toBe(AGENCY_ORG_ID);
      }
      expect(mockSubOrgMembershipFindUnique).not.toHaveBeenCalled();
    },
  );

  it("blocks agency-mode VIEWER when the role is below the required set", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockOrgRelationshipFindFirst.mockResolvedValueOnce(baseRelationship);
    mockAgencyMembershipFindUnique.mockResolvedValueOnce(agencyMembership("VIEWER"));

    const result = await requireSubOrgAccess(SUB_ORG_ID, {
      requiredAgencyRole: ["OWNER", "ADMIN", "CONSULTANT"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked");
    expect(result.response.status).toBe(403);
    const body = await result.response.json();
    expect(body.errorCode).toBe("INSUFFICIENT_AGENCY_ROLE");
  });

  it("blocks agency-mode access when no AgencyMembership exists", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockOrgRelationshipFindFirst.mockResolvedValueOnce(baseRelationship);
    mockAgencyMembershipFindUnique.mockResolvedValueOnce(null);

    const result = await requireSubOrgAccess(SUB_ORG_ID, {
      requiredAgencyRole: ["OWNER", "ADMIN"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked");
    expect(result.response.status).toBe(403);
  });

  it("404s agency-mode access from a different agency", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID, orgId: "org_other" });
    mockOrgRelationshipFindFirst.mockResolvedValueOnce(null);

    const result = await requireSubOrgAccess(SUB_ORG_ID, {
      requiredAgencyRole: ["OWNER", "ADMIN"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
    expect(mockOrgRelationshipFindFirst).toHaveBeenCalledWith({
      where: { id: SUB_ORG_ID, parentOrgId: "org_other" },
    });
    expect(mockAgencyMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("requires both agency role and sub-org permission when both are set", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockOrgRelationshipFindFirst.mockResolvedValueOnce(baseRelationship);
    mockAgencyMembershipFindUnique.mockResolvedValueOnce(agencyMembership("ADMIN"));
    mockSubOrgMembershipFindUnique.mockResolvedValueOnce(
      subOrgMembership("FULL_ACCESS"),
    );

    const result = await requireSubOrgAccess(SUB_ORG_ID, {
      requiredAgencyRole: ["OWNER", "ADMIN"],
      requiredSubOrgPermission: "memberships.manage",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.agencyMembership.role).toBe("ADMIN");
      expect(result.membership.permissionSet).toBe("FULL_ACCESS");
      expect(result.relationship.childOrgId).toBe(CHILD_ORG_ID);
    }
  });

  it("blocks the AND path when the sub-org permission is missing", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID, orgId: AGENCY_ORG_ID });
    mockOrgRelationshipFindFirst.mockResolvedValueOnce(baseRelationship);
    mockAgencyMembershipFindUnique.mockResolvedValueOnce(agencyMembership("ADMIN"));
    mockSubOrgMembershipFindUnique.mockResolvedValueOnce(
      subOrgMembership("READ_ONLY"),
    );

    const result = await requireSubOrgAccess(SUB_ORG_ID, {
      requiredAgencyRole: ["OWNER", "ADMIN"],
      requiredSubOrgPermission: "memberships.manage",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("404s agency-mode access when the active org is the sub-org child", async () => {
    mockAuth.mockResolvedValueOnce({ userId: USER_ID, orgId: CHILD_ORG_ID });
    mockOrgRelationshipFindFirst.mockResolvedValueOnce(null);

    const result = await requireSubOrgAccess(SUB_ORG_ID, {
      requiredAgencyRole: ["OWNER", "ADMIN"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
    expect(mockOrgRelationshipFindFirst).toHaveBeenCalledWith({
      where: { id: SUB_ORG_ID, parentOrgId: CHILD_ORG_ID },
    });
    expect(mockAgencyMembershipFindUnique).not.toHaveBeenCalled();
  });
});
