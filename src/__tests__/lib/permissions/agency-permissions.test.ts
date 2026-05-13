/**
 * Sprint 19.7.6 — agency-permissions matrix + lookup helpers.
 */
import { describe, expect, it, vi } from "vitest";
import type { AgencyMembership, OrgRelationship } from "@prisma/client";
import {
  canAccessSubOrgViaAgency,
  defaultPermissionSetForRole,
  ensureAgencyMembershipFromClerkRole,
  getAccessibleSubOrgIds,
  getAgencyMembership,
  hasAgencyPermission,
  permissionsForAgencyRole,
} from "@/lib/permissions/agency-permissions";

function makeMembership(overrides: Partial<AgencyMembership> = {}): AgencyMembership {
  return {
    id: "am_1",
    agencyClerkOrgId: "org_agency",
    userId: "user_1",
    role: "VIEWER",
    invitedById: null,
    invitedAt: null,
    acceptedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSubOrgRow(overrides: Partial<OrgRelationship> = {}): Partial<OrgRelationship> {
  return {
    id: "sub_1",
    parentOrgId: "org_agency",
    ...overrides,
  };
}

function makePrisma({
  membership = null,
  subOrgRow = null,
  assignments = [],
  assignment = null,
}: {
  membership?: AgencyMembership | null;
  subOrgRow?: Partial<OrgRelationship> | null;
  assignments?: { subOrgId: string }[];
  assignment?: { permissionOverride: string | null } | null;
} = {}) {
  return {
    agencyMembership: {
      findUnique: vi.fn().mockResolvedValue(membership),
      create: vi.fn().mockResolvedValue(membership),
    },
    agencyMemberSubOrgAccess: {
      findMany: vi.fn().mockResolvedValue(assignments),
      findUnique: vi.fn().mockResolvedValue(assignment),
    },
    orgRelationship: {
      findUnique: vi.fn().mockResolvedValue(subOrgRow),
    },
  } as unknown as Parameters<typeof getAgencyMembership>[2];
}

describe("permissionsForAgencyRole", () => {
  it("OWNER has billing + members + all-sub-orgs", () => {
    const p = permissionsForAgencyRole("OWNER");
    expect(p.has("billing.manage")).toBe(true);
    expect(p.has("members.manage")).toBe(true);
    expect(p.has("all-sub-orgs.access")).toBe(true);
    expect(p.has("sub-orgs.delete")).toBe(true);
  });

  it("ADMIN has everything except billing", () => {
    const p = permissionsForAgencyRole("ADMIN");
    expect(p.has("billing.manage")).toBe(false);
    expect(p.has("members.manage")).toBe(true);
    expect(p.has("all-sub-orgs.access")).toBe(true);
    expect(p.has("templates.manage")).toBe(true);
  });

  it("CONSULTANT only has sub-orgs.read (no all-sub-orgs.access)", () => {
    const p = permissionsForAgencyRole("CONSULTANT");
    expect(p.has("sub-orgs.read")).toBe(true);
    expect(p.has("all-sub-orgs.access")).toBe(false);
    expect(p.has("members.manage")).toBe(false);
    expect(p.has("billing.manage")).toBe(false);
  });

  it("VIEWER only has sub-orgs.read", () => {
    const p = permissionsForAgencyRole("VIEWER");
    expect(p.has("sub-orgs.read")).toBe(true);
    expect(p.has("all-sub-orgs.access")).toBe(false);
    expect(p.has("templates.manage")).toBe(false);
  });
});

describe("defaultPermissionSetForRole", () => {
  it("OWNER/ADMIN/CONSULTANT → FULL_ACCESS", () => {
    expect(defaultPermissionSetForRole("OWNER")).toBe("FULL_ACCESS");
    expect(defaultPermissionSetForRole("ADMIN")).toBe("FULL_ACCESS");
    expect(defaultPermissionSetForRole("CONSULTANT")).toBe("FULL_ACCESS");
  });

  it("VIEWER → READ_ONLY", () => {
    expect(defaultPermissionSetForRole("VIEWER")).toBe("READ_ONLY");
  });
});

describe("hasAgencyPermission", () => {
  it("true when role grants permission", async () => {
    const prisma = makePrisma({ membership: makeMembership({ role: "OWNER" }) });
    await expect(hasAgencyPermission("user_1", "org_agency", "billing.manage", prisma)).resolves.toBe(true);
  });

  it("false when role does not grant permission", async () => {
    const prisma = makePrisma({ membership: makeMembership({ role: "ADMIN" }) });
    await expect(hasAgencyPermission("user_1", "org_agency", "billing.manage", prisma)).resolves.toBe(false);
  });

  it("false when no membership row exists", async () => {
    const prisma = makePrisma({ membership: null });
    await expect(hasAgencyPermission("user_1", "org_agency", "sub-orgs.read", prisma)).resolves.toBe(false);
  });
});

describe("getAccessibleSubOrgIds", () => {
  it("returns null when caller is not an agency-member", async () => {
    const prisma = makePrisma({ membership: null });
    await expect(getAccessibleSubOrgIds("user_1", "org_agency", prisma)).resolves.toBeNull();
  });

  it("returns scope=all for OWNER", async () => {
    const prisma = makePrisma({ membership: makeMembership({ role: "OWNER" }) });
    const result = await getAccessibleSubOrgIds("user_1", "org_agency", prisma);
    expect(result?.scope).toBe("all");
  });

  it("returns scope=all for ADMIN", async () => {
    const prisma = makePrisma({ membership: makeMembership({ role: "ADMIN" }) });
    const result = await getAccessibleSubOrgIds("user_1", "org_agency", prisma);
    expect(result?.scope).toBe("all");
  });

  it("returns scope=assigned with explicit ids for CONSULTANT", async () => {
    const prisma = makePrisma({
      membership: makeMembership({ role: "CONSULTANT" }),
      assignments: [{ subOrgId: "sub_a" }, { subOrgId: "sub_b" }],
    });
    const result = await getAccessibleSubOrgIds("user_1", "org_agency", prisma);
    expect(result?.scope).toBe("assigned");
    if (result?.scope === "assigned") {
      expect(result.subOrgIds).toEqual(["sub_a", "sub_b"]);
    }
  });

  it("VIEWER with no assignments returns empty list", async () => {
    const prisma = makePrisma({
      membership: makeMembership({ role: "VIEWER" }),
      assignments: [],
    });
    const result = await getAccessibleSubOrgIds("user_1", "org_agency", prisma);
    expect(result?.scope).toBe("assigned");
    if (result?.scope === "assigned") {
      expect(result.subOrgIds).toEqual([]);
    }
  });
});

describe("canAccessSubOrgViaAgency", () => {
  it("returns null when sub-org does not exist", async () => {
    const prisma = makePrisma({ subOrgRow: null });
    await expect(canAccessSubOrgViaAgency("user_1", "sub_1", prisma)).resolves.toBeNull();
  });

  it("returns null when user is not an agency-member", async () => {
    const prisma = makePrisma({
      subOrgRow: makeSubOrgRow(),
      membership: null,
    });
    await expect(canAccessSubOrgViaAgency("user_1", "sub_1", prisma)).resolves.toBeNull();
  });

  it("OWNER → FULL_ACCESS without needing assignment", async () => {
    const prisma = makePrisma({
      subOrgRow: makeSubOrgRow(),
      membership: makeMembership({ role: "OWNER" }),
    });
    const result = await canAccessSubOrgViaAgency("user_1", "sub_1", prisma);
    expect(result?.effectivePermissionSet).toBe("FULL_ACCESS");
  });

  it("ADMIN → FULL_ACCESS without needing assignment", async () => {
    const prisma = makePrisma({
      subOrgRow: makeSubOrgRow(),
      membership: makeMembership({ role: "ADMIN" }),
    });
    const result = await canAccessSubOrgViaAgency("user_1", "sub_1", prisma);
    expect(result?.effectivePermissionSet).toBe("FULL_ACCESS");
  });

  it("CONSULTANT without assignment is denied", async () => {
    const prisma = makePrisma({
      subOrgRow: makeSubOrgRow(),
      membership: makeMembership({ role: "CONSULTANT" }),
      assignment: null,
    });
    await expect(canAccessSubOrgViaAgency("user_1", "sub_1", prisma)).resolves.toBeNull();
  });

  it("CONSULTANT with assignment gets FULL_ACCESS by default", async () => {
    const prisma = makePrisma({
      subOrgRow: makeSubOrgRow(),
      membership: makeMembership({ role: "CONSULTANT" }),
      // assignment exists with no permissionOverride → role default kicks in.
      assignment: { permissionOverride: null } as unknown as {
        permissionOverride: null;
      },
    });
    const result = await canAccessSubOrgViaAgency("user_1", "sub_1", prisma);
    expect(result?.effectivePermissionSet).toBe("FULL_ACCESS");
  });

  it("VIEWER with assignment gets READ_ONLY by default", async () => {
    const prisma = makePrisma({
      subOrgRow: makeSubOrgRow(),
      membership: makeMembership({ role: "VIEWER" }),
      assignment: { permissionOverride: null } as unknown as {
        permissionOverride: null;
      },
    });
    const result = await canAccessSubOrgViaAgency("user_1", "sub_1", prisma);
    expect(result?.effectivePermissionSet).toBe("READ_ONLY");
  });

  it("permissionOverride wins over role default", async () => {
    const prisma = makePrisma({
      subOrgRow: makeSubOrgRow(),
      membership: makeMembership({ role: "VIEWER" }),
      assignment: { permissionOverride: "USE_AGENTS_PLUS_KNOWLEDGE" } as unknown as {
        permissionOverride: "USE_AGENTS_PLUS_KNOWLEDGE";
      },
    });
    const result = await canAccessSubOrgViaAgency("user_1", "sub_1", prisma);
    expect(result?.effectivePermissionSet).toBe("USE_AGENTS_PLUS_KNOWLEDGE");
  });
});

describe("ensureAgencyMembershipFromClerkRole", () => {
  it("returns existing row without creating when one exists", async () => {
    const existing = makeMembership({ role: "ADMIN" });
    const prisma = makePrisma({ membership: existing });
    const result = await ensureAgencyMembershipFromClerkRole(
      "user_1",
      "org_agency",
      "org:admin",
      prisma,
    );
    expect(result).toEqual(existing);
    // existing returned — create must not fire
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma as any).agencyMembership.create).not.toHaveBeenCalled();
  });

  it("creates OWNER row when no row exists and caller is org:admin", async () => {
    const prisma = makePrisma({ membership: null });
    // mock create to return the new row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).agencyMembership.create.mockResolvedValueOnce(
      makeMembership({ role: "OWNER" }),
    );
    const result = await ensureAgencyMembershipFromClerkRole(
      "user_1",
      "org_agency",
      "org:admin",
      prisma,
    );
    expect(result?.role).toBe("OWNER");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma as any).agencyMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agencyClerkOrgId: "org_agency",
        userId: "user_1",
        role: "OWNER",
      }),
    });
  });

  it("returns null when no row exists and caller is org:member (no auto-bootstrap)", async () => {
    const prisma = makePrisma({ membership: null });
    const result = await ensureAgencyMembershipFromClerkRole(
      "user_1",
      "org_agency",
      "org:member",
      prisma,
    );
    expect(result).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma as any).agencyMembership.create).not.toHaveBeenCalled();
  });

  it("returns null when clerkRole is missing/null", async () => {
    const prisma = makePrisma({ membership: null });
    await expect(
      ensureAgencyMembershipFromClerkRole("user_1", "org_agency", null, prisma),
    ).resolves.toBeNull();
  });
});
