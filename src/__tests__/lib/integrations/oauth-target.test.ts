/**
 * Sprint 19.7.5 — resolveOAuthTargetOrgId tests.
 */
import { describe, expect, it, vi } from "vitest";
import { resolveOAuthTargetOrgId } from "@/lib/integrations/oauth-target";

function makePrisma(opts: {
  membership?:
    | {
        permissionSet:
          | "READ_ONLY"
          | "USE_AGENTS"
          | "USE_AGENTS_PLUS_KNOWLEDGE"
          | "FULL_ACCESS";
      }
    | null;
  rel?: { childOrgId: string; subOrgStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED" } | null;
}) {
  return {
    orgRelationship: {
      findUnique: vi.fn().mockResolvedValue(
        opts.rel === undefined
          ? { childOrgId: "org_clerk_sub", subOrgStatus: "ACTIVE" }
          : opts.rel,
      ),
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
  } as unknown as Parameters<typeof resolveOAuthTargetOrgId>[1];
}

describe("resolveOAuthTargetOrgId", () => {
  it("returns the agency orgId when no subOrgId is set (legacy flow)", async () => {
    const res = await resolveOAuthTargetOrgId(
      { userId: "user_1", agencyOrgId: "org_agency", subOrgId: null },
      makePrisma({}),
    );
    expect(res).toEqual({ ok: true, orgId: "org_agency", usedSubOrg: null });
  });

  it("passes through a null agencyOrgId — caller still creates the connection", async () => {
    const res = await resolveOAuthTargetOrgId(
      { userId: "user_1", agencyOrgId: null, subOrgId: undefined },
      makePrisma({}),
    );
    expect(res).toEqual({ ok: true, orgId: null, usedSubOrg: null });
  });

  it("returns the sub-org's clerk org when membership has integrations.manage", async () => {
    const res = await resolveOAuthTargetOrgId(
      { userId: "user_1", agencyOrgId: "org_agency", subOrgId: "sub_1" },
      makePrisma({}),
    );
    expect(res).toEqual({
      ok: true,
      orgId: "org_clerk_sub",
      usedSubOrg: { subOrgId: "sub_1", clerkOrgId: "org_clerk_sub" },
    });
  });

  it("403s when membership exists but lacks integrations.manage (READ_ONLY)", async () => {
    const res = await resolveOAuthTargetOrgId(
      { userId: "user_1", agencyOrgId: "org_agency", subOrgId: "sub_1" },
      makePrisma({ membership: { permissionSet: "READ_ONLY" } }),
    );
    expect(res).toMatchObject({ ok: false, status: 403 });
  });

  it("403s for USE_AGENTS_PLUS_KNOWLEDGE — integrations.manage is FULL_ACCESS only", async () => {
    const res = await resolveOAuthTargetOrgId(
      { userId: "user_1", agencyOrgId: "org_agency", subOrgId: "sub_1" },
      makePrisma({ membership: { permissionSet: "USE_AGENTS_PLUS_KNOWLEDGE" } }),
    );
    expect(res).toMatchObject({ ok: false, status: 403 });
  });

  it("404s when membership is missing (cross-tenant existence hiding)", async () => {
    const res = await resolveOAuthTargetOrgId(
      { userId: "user_1", agencyOrgId: "org_agency", subOrgId: "sub_x" },
      makePrisma({ membership: null }),
    );
    expect(res).toMatchObject({ ok: false, status: 404 });
  });

  it("404s when the OrgRelationship row no longer exists", async () => {
    const res = await resolveOAuthTargetOrgId(
      { userId: "user_1", agencyOrgId: "org_agency", subOrgId: "sub_1" },
      makePrisma({ rel: null }),
    );
    expect(res).toMatchObject({ ok: false, status: 404 });
  });

  it("403s when the sub-org is suspended or archived", async () => {
    const suspended = await resolveOAuthTargetOrgId(
      { userId: "user_1", agencyOrgId: "org_agency", subOrgId: "sub_1" },
      makePrisma({ rel: { childOrgId: "child", subOrgStatus: "SUSPENDED" } }),
    );
    expect(suspended).toMatchObject({ ok: false, status: 403 });

    const archived = await resolveOAuthTargetOrgId(
      { userId: "user_1", agencyOrgId: "org_agency", subOrgId: "sub_1" },
      makePrisma({ rel: { childOrgId: "child", subOrgStatus: "ARCHIVED" } }),
    );
    expect(archived).toMatchObject({ ok: false, status: 403 });
  });
});
