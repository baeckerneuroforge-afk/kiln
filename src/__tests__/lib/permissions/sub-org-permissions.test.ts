/**
 * Sprint 19.7.1 — sub-org permission matrix + membership lookup.
 */
import { describe, expect, it, vi } from "vitest";
import type { SubOrgMembership } from "@prisma/client";
import {
  canAccessSubOrg,
  canManageSubOrgMembers,
  getUserSubOrgMembership,
  hasSubOrgPermission,
  permissionsFor,
} from "@/lib/permissions/sub-org-permissions";

function makeMembership(overrides: Partial<SubOrgMembership> = {}): SubOrgMembership {
  return {
    id: "mem_1",
    subOrgId: "sub_1",
    userId: "user_1",
    role: "MEMBER",
    permissionSet: "READ_ONLY",
    invitedById: null,
    invitedAt: null,
    acceptedAt: new Date(),
    onboardingStepCompleted: null,
    onboardingCompletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrismaWithMembership(membership: SubOrgMembership | null) {
  return {
    subOrgMembership: {
      findUnique: vi.fn().mockResolvedValue(membership),
    },
  } as unknown as Parameters<typeof getUserSubOrgMembership>[2];
}

describe("permissionsFor", () => {
  it("READ_ONLY grants only conversations/analytics read", () => {
    const perms = permissionsFor("READ_ONLY");
    expect(perms.has("conversations.read")).toBe(true);
    expect(perms.has("analytics.read")).toBe(true);
    expect(perms.has("agents.read")).toBe(false);
    expect(perms.has("knowledge.write")).toBe(false);
  });

  it("USE_AGENTS adds agents.read and agents.execute on top of READ_ONLY", () => {
    const perms = permissionsFor("USE_AGENTS");
    expect(perms.has("conversations.read")).toBe(true);
    expect(perms.has("agents.read")).toBe(true);
    expect(perms.has("agents.execute")).toBe(true);
    expect(perms.has("agents.write")).toBe(false);
    expect(perms.has("knowledge.write")).toBe(false);
  });

  it("USE_AGENTS_PLUS_KNOWLEDGE includes knowledge read/write", () => {
    const perms = permissionsFor("USE_AGENTS_PLUS_KNOWLEDGE");
    expect(perms.has("knowledge.read")).toBe(true);
    expect(perms.has("knowledge.write")).toBe(true);
    expect(perms.has("workflows.read")).toBe(false);
    expect(perms.has("memberships.manage")).toBe(false);
  });

  it("FULL_ACCESS grants everything including memberships.manage", () => {
    const perms = permissionsFor("FULL_ACCESS");
    expect(perms.has("agents.write")).toBe(true);
    expect(perms.has("workflows.read")).toBe(true);
    expect(perms.has("workflows.write")).toBe(true);
    expect(perms.has("integrations.read")).toBe(true);
    expect(perms.has("integrations.manage")).toBe(true);
    expect(perms.has("memberships.manage")).toBe(true);
  });

  // Sprint 19.7.4 — integrations.read is in every tier so members can
  // see what's wired up; .manage stays FULL_ACCESS-only.
  it("integrations.read is in every permission set", () => {
    for (const set of ["READ_ONLY", "USE_AGENTS", "USE_AGENTS_PLUS_KNOWLEDGE", "FULL_ACCESS"] as const) {
      expect(permissionsFor(set).has("integrations.read")).toBe(true);
    }
  });

  it("integrations.manage is FULL_ACCESS only", () => {
    expect(permissionsFor("READ_ONLY").has("integrations.manage")).toBe(false);
    expect(permissionsFor("USE_AGENTS").has("integrations.manage")).toBe(false);
    expect(permissionsFor("USE_AGENTS_PLUS_KNOWLEDGE").has("integrations.manage")).toBe(false);
    expect(permissionsFor("FULL_ACCESS").has("integrations.manage")).toBe(true);
  });
});

describe("getUserSubOrgMembership", () => {
  it("returns the membership when found", async () => {
    const membership = makeMembership();
    const prisma = makePrismaWithMembership(membership);
    const result = await getUserSubOrgMembership("user_1", "sub_1", prisma);
    expect(result).toEqual(membership);
  });

  it("returns null when there is no membership", async () => {
    const prisma = makePrismaWithMembership(null);
    const result = await getUserSubOrgMembership("user_1", "sub_1", prisma);
    expect(result).toBeNull();
  });
});

describe("canAccessSubOrg", () => {
  it("true when a membership exists", async () => {
    const prisma = makePrismaWithMembership(makeMembership());
    await expect(canAccessSubOrg("user_1", "sub_1", prisma)).resolves.toBe(true);
  });

  it("false when no membership exists", async () => {
    const prisma = makePrismaWithMembership(null);
    await expect(canAccessSubOrg("user_1", "sub_1", prisma)).resolves.toBe(false);
  });
});

describe("hasSubOrgPermission", () => {
  it("READ_ONLY user can read conversations", async () => {
    const prisma = makePrismaWithMembership(makeMembership({ permissionSet: "READ_ONLY" }));
    await expect(
      hasSubOrgPermission("user_1", "sub_1", "conversations.read", prisma),
    ).resolves.toBe(true);
  });

  it("READ_ONLY user cannot write agents", async () => {
    const prisma = makePrismaWithMembership(makeMembership({ permissionSet: "READ_ONLY" }));
    await expect(
      hasSubOrgPermission("user_1", "sub_1", "agents.write", prisma),
    ).resolves.toBe(false);
  });

  it("USE_AGENTS user can execute agents", async () => {
    const prisma = makePrismaWithMembership(makeMembership({ permissionSet: "USE_AGENTS" }));
    await expect(
      hasSubOrgPermission("user_1", "sub_1", "agents.execute", prisma),
    ).resolves.toBe(true);
  });

  it("FULL_ACCESS user can manage memberships", async () => {
    const prisma = makePrismaWithMembership(makeMembership({ permissionSet: "FULL_ACCESS" }));
    await expect(
      hasSubOrgPermission("user_1", "sub_1", "memberships.manage", prisma),
    ).resolves.toBe(true);
  });

  it("returns false when there is no membership at all", async () => {
    const prisma = makePrismaWithMembership(null);
    await expect(
      hasSubOrgPermission("user_1", "sub_1", "conversations.read", prisma),
    ).resolves.toBe(false);
  });
});

describe("canManageSubOrgMembers (Sprint 19.7.6.2)", () => {
  it("OWNER role always passes, even with READ_ONLY permissionSet", () => {
    expect(canManageSubOrgMembers({ role: "OWNER", permissionSet: "READ_ONLY" })).toBe(true);
  });

  it("ADMIN role always passes, even with USE_AGENTS permissionSet", () => {
    expect(canManageSubOrgMembers({ role: "ADMIN", permissionSet: "USE_AGENTS" })).toBe(true);
  });

  it("MEMBER role with FULL_ACCESS passes via permissionSet bypass", () => {
    expect(canManageSubOrgMembers({ role: "MEMBER", permissionSet: "FULL_ACCESS" })).toBe(true);
  });

  it("MEMBER role with USE_AGENTS_PLUS_KNOWLEDGE is denied", () => {
    expect(
      canManageSubOrgMembers({ role: "MEMBER", permissionSet: "USE_AGENTS_PLUS_KNOWLEDGE" }),
    ).toBe(false);
  });

  it("VIEWER role with READ_ONLY is denied", () => {
    expect(canManageSubOrgMembers({ role: "VIEWER", permissionSet: "READ_ONLY" })).toBe(false);
  });
});
