/**
 * Sprint 19.7.2 — get-user-sub-orgs server helper.
 */
import { describe, expect, it, vi } from "vitest";
import { getUserSubOrgs } from "@/lib/sub-org/get-user-sub-orgs";

function makeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_1",
    subOrgId: "sub_1",
    userId: "user_1",
    role: "MEMBER",
    permissionSet: "READ_ONLY",
    invitedById: null,
    invitedAt: null,
    acceptedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    subOrg: {
      id: "sub_1",
      parentOrgId: "org_agency_1",
      childOrgId: "org_child_1",
      subOrgName: "Acme",
      subOrgStatus: "ACTIVE",
    },
    ...overrides,
  };
}

function makePrismaWith(memberships: ReturnType<typeof makeMembership>[]) {
  return {
    subOrgMembership: {
      findMany: vi.fn().mockResolvedValue(memberships),
    },
  } as unknown as NonNullable<Parameters<typeof getUserSubOrgs>[1]>;
}

describe("getUserSubOrgs", () => {
  it("returns an empty list when no userId is provided", async () => {
    await expect(getUserSubOrgs("", makePrismaWith([]))).resolves.toEqual([]);
  });

  it("maps memberships to the public entry shape", async () => {
    const prisma = makePrismaWith([makeMembership()]);
    const result = await getUserSubOrgs("user_1", prisma);
    expect(result).toEqual([
      {
        subOrgId: "sub_1",
        childOrgId: "org_child_1",
        parentOrgId: "org_agency_1",
        name: "Acme",
        status: "ACTIVE",
        role: "MEMBER",
        permissionSet: "READ_ONLY",
      },
    ]);
  });

  it("preserves the role and permissionSet from each membership row", async () => {
    const prisma = makePrismaWith([
      makeMembership({ role: "OWNER", permissionSet: "FULL_ACCESS" }),
    ]);
    const [entry] = await getUserSubOrgs("user_1", prisma);
    expect(entry.role).toBe("OWNER");
    expect(entry.permissionSet).toBe("FULL_ACCESS");
  });

  it("returns multiple memberships in createdAt order (delegated to Prisma)", async () => {
    const prisma = makePrismaWith([
      makeMembership({ id: "mem_a", subOrg: { ...makeMembership().subOrg, id: "sub_a", subOrgName: "Alpha" } }),
      makeMembership({ id: "mem_b", subOrg: { ...makeMembership().subOrg, id: "sub_b", subOrgName: "Beta" } }),
    ]);
    const result = await getUserSubOrgs("user_1", prisma);
    expect(result.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
    const findMany = (prisma.subOrgMembership.findMany as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      orderBy?: { createdAt?: string };
    };
    expect(findMany.orderBy?.createdAt).toBe("asc");
  });
});
