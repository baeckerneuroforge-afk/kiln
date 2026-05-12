/**
 * Sprint 19.7.4 — resolveCreateTargetOrgId tests.
 */
import { describe, expect, it, vi } from "vitest";
import { resolveCreateTargetOrgId } from "@/lib/sub-org/resolve-create-target";

function makePrisma(opts: {
  membership?: { permissionSet: "READ_ONLY" | "USE_AGENTS" | "USE_AGENTS_PLUS_KNOWLEDGE" | "FULL_ACCESS" } | null;
  rel?: { childOrgId: string; subOrgStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED" } | null;
}) {
  return {
    orgRelationship: {
      findUnique: vi.fn().mockResolvedValue(opts.rel === undefined ? { childOrgId: "org_clerk_sub", subOrgStatus: "ACTIVE" } : opts.rel),
    },
    subOrgMembership: {
      findUnique: vi.fn().mockResolvedValue(
        opts.membership === undefined
          ? { id: "mem_1", subOrgId: "sub_1", userId: "user_1", role: "OWNER", permissionSet: "FULL_ACCESS" }
          : opts.membership === null
            ? null
            : { id: "mem_1", subOrgId: "sub_1", userId: "user_1", role: "MEMBER", ...opts.membership },
      ),
    },
  } as unknown as Parameters<typeof resolveCreateTargetOrgId>[1];
}

describe("resolveCreateTargetOrgId", () => {
  it("401s when userId is empty", async () => {
    const res = await resolveCreateTargetOrgId(
      { userId: "", defaultOrgId: "org_agency", subOrgId: null, requiredPermission: "agents.write" },
      makePrisma({}),
    );
    expect(res).toMatchObject({ ok: false, status: 401 });
  });

  it("returns the default org when subOrgId is not provided", async () => {
    const res = await resolveCreateTargetOrgId(
      { userId: "user_1", defaultOrgId: "org_agency", subOrgId: null, requiredPermission: "agents.write" },
      makePrisma({}),
    );
    expect(res).toEqual({ ok: true, orgId: "org_agency", usedSubOrg: null });
  });

  it("401s when there is no default org AND no subOrgId", async () => {
    const res = await resolveCreateTargetOrgId(
      { userId: "user_1", defaultOrgId: null, subOrgId: null, requiredPermission: "agents.write" },
      makePrisma({}),
    );
    expect(res).toMatchObject({ ok: false, status: 401 });
  });

  it("404s when the caller has no membership for the requested sub-org", async () => {
    const res = await resolveCreateTargetOrgId(
      { userId: "user_1", defaultOrgId: "org_agency", subOrgId: "sub_other", requiredPermission: "agents.write" },
      makePrisma({ membership: null }),
    );
    expect(res).toMatchObject({ ok: false, status: 404 });
  });

  it("403s when membership exists but lacks the required permission", async () => {
    const res = await resolveCreateTargetOrgId(
      { userId: "user_1", defaultOrgId: "org_agency", subOrgId: "sub_1", requiredPermission: "agents.write" },
      makePrisma({ membership: { permissionSet: "USE_AGENTS" } }),
    );
    expect(res).toMatchObject({ ok: false, status: 403 });
  });

  it("403s when the sub-org is archived or suspended", async () => {
    const res = await resolveCreateTargetOrgId(
      { userId: "user_1", defaultOrgId: "org_agency", subOrgId: "sub_1", requiredPermission: "agents.write" },
      makePrisma({ rel: { childOrgId: "org_clerk_sub", subOrgStatus: "ARCHIVED" } }),
    );
    expect(res).toMatchObject({ ok: false, status: 403 });
  });

  it("returns the sub-org's Clerk org id on success", async () => {
    const res = await resolveCreateTargetOrgId(
      { userId: "user_1", defaultOrgId: "org_agency", subOrgId: "sub_42", requiredPermission: "agents.write" },
      makePrisma({}),
    );
    expect(res).toEqual({
      ok: true,
      orgId: "org_clerk_sub",
      usedSubOrg: { subOrgId: "sub_42", clerkOrgId: "org_clerk_sub" },
    });
  });
});
