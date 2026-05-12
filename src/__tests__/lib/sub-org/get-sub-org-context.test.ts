/**
 * Sprint 19.7.3 — getSubOrgContext server helper.
 */
import { describe, expect, it, vi } from "vitest";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";

function makeContextDeps(overrides: {
  userId?: string | null;
  membership?: Record<string, unknown> | null;
  subOrg?: Record<string, unknown> | null;
}) {
  const findMembership = vi.fn().mockResolvedValue(
    overrides.membership === undefined
      ? { id: "mem_1", subOrgId: "sub_1", userId: "user_1", role: "MEMBER", permissionSet: "READ_ONLY" }
      : overrides.membership,
  );
  const findSubOrg = vi.fn().mockResolvedValue(
    overrides.subOrg === undefined
      ? {
          id: "sub_1",
          childOrgId: "org_clerk_child_1",
          parentOrgId: "org_clerk_parent_1",
          subOrgName: "Acme",
          subOrgStatus: "ACTIVE",
          brandColor: null,
          logoUrl: null,
          industry: null,
        }
      : overrides.subOrg,
  );
  // Use `in` to honour an explicit `null` override (??) coerces null
  // to the default and made the unauthenticated branch unreachable).
  const userId = "userId" in overrides ? overrides.userId : "user_1";
  return {
    auth: vi.fn().mockResolvedValue({ userId }),
    prisma: {
      orgRelationship: { findUnique: findSubOrg },
      subOrgMembership: { findUnique: findMembership },
    } as unknown as Parameters<typeof getSubOrgContext>[1] extends infer D
      ? D extends undefined ? never : NonNullable<Parameters<typeof getSubOrgContext>[1]>["prisma"]
      : never,
  };
}

describe("getSubOrgContext", () => {
  it("returns null when the caller is unauthenticated", async () => {
    const deps = makeContextDeps({ userId: null });
    // Pass the fake prisma too so the helper never falls through to
    // defaultPrisma (which would crash without a DATABASE_URL in unit tests).
    await expect(getSubOrgContext("sub_1", { auth: deps.auth, prisma: deps.prisma })).resolves.toBeNull();
  });

  it("returns null when the user has no SubOrgMembership for the sub-org", async () => {
    const deps = makeContextDeps({ membership: null });
    await expect(getSubOrgContext("sub_1", { auth: deps.auth, prisma: deps.prisma })).resolves.toBeNull();
  });

  it("returns null when the OrgRelationship row no longer exists", async () => {
    const deps = makeContextDeps({ subOrg: null });
    await expect(getSubOrgContext("sub_1", { auth: deps.auth, prisma: deps.prisma })).resolves.toBeNull();
  });

  it("returns the full context shape on success", async () => {
    const deps = makeContextDeps({});
    const result = await getSubOrgContext("sub_1", { auth: deps.auth, prisma: deps.prisma });
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("user_1");
    expect(result!.clerkOrgId).toBe("org_clerk_child_1");
    expect(result!.subOrg.subOrgName).toBe("Acme");
    expect(result!.membership.role).toBe("MEMBER");
    expect(result!.permissions.has("conversations.read")).toBe(true);
  });

  it("permissionsFor result matches the membership's permissionSet", async () => {
    const deps = makeContextDeps({
      membership: { id: "mem_full", subOrgId: "sub_1", userId: "user_1", role: "OWNER", permissionSet: "FULL_ACCESS" },
    });
    const result = await getSubOrgContext("sub_1", { auth: deps.auth, prisma: deps.prisma });
    expect(result!.permissions.has("memberships.manage")).toBe(true);
    expect(result!.permissions.has("workflows.write")).toBe(true);
  });
});
