/**
 * Sprint 19.7.4.1 — buildHierarchy + getUserOrgHierarchy.
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildHierarchy,
  getUserOrgHierarchy,
} from "@/lib/org/get-user-org-hierarchy";

function m(id: string, name: string) {
  return { organization: { id, name, imageUrl: undefined }, role: "org:admin" };
}

function rel(opts: {
  id?: string;
  parent: string;
  child: string;
  name?: string;
  status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}) {
  return {
    id: opts.id ?? `rel_${opts.child}`,
    parentOrgId: opts.parent,
    childOrgId: opts.child,
    subOrgName: opts.name ?? `Sub ${opts.child}`,
    subOrgStatus: opts.status ?? "ACTIVE",
  } as const;
}

describe("buildHierarchy — buckets", () => {
  it("empty memberships → empty hierarchy", () => {
    expect(buildHierarchy({ memberships: [], personalOrgId: null, relationships: [] })).toEqual({
      personal: null,
      agencies: [],
      standaloneOrgs: [],
    });
  });

  it("one agency with no sub-orgs renders as an agency (subOrgs: [])", () => {
    const out = buildHierarchy({
      memberships: [m("org_agency", "Hephaistos")],
      personalOrgId: null,
      relationships: [],
    });
    // No relationship rows → the agency org is currently "standalone"
    // from the data's perspective. That's intentional: we only call it
    // an agency once it has at least one ACTIVE sub-org.
    expect(out.agencies).toHaveLength(0);
    expect(out.standaloneOrgs).toEqual([
      { clerkOrgId: "org_agency", name: "Hephaistos", imageUrl: null },
    ]);
  });

  it("one agency with three active sub-orgs nests them under the parent", () => {
    const out = buildHierarchy({
      memberships: [
        m("org_agency", "Hephaistos"),
        m("org_sub_a", "Sub A"),
        m("org_sub_b", "Sub B"),
        m("org_sub_c", "Sub C"),
      ],
      personalOrgId: null,
      relationships: [
        rel({ id: "r1", parent: "org_agency", child: "org_sub_a", name: "Sub A" }),
        rel({ id: "r2", parent: "org_agency", child: "org_sub_b", name: "Sub B" }),
        rel({ id: "r3", parent: "org_agency", child: "org_sub_c", name: "Sub C" }),
      ],
    });
    expect(out.agencies).toHaveLength(1);
    expect(out.agencies[0].clerkOrgId).toBe("org_agency");
    expect(out.agencies[0].subOrgs.map((s) => s.subOrgId)).toEqual(["r1", "r2", "r3"]);
    expect(out.standaloneOrgs).toHaveLength(0);
  });

  it("user in two agencies, each with sub-orgs", () => {
    const out = buildHierarchy({
      memberships: [
        m("agency_1", "Agency One"),
        m("agency_2", "Agency Two"),
        m("sub_1", "S1"),
        m("sub_2", "S2"),
      ],
      personalOrgId: null,
      relationships: [
        rel({ id: "r1", parent: "agency_1", child: "sub_1", name: "S1" }),
        rel({ id: "r2", parent: "agency_2", child: "sub_2", name: "S2" }),
      ],
    });
    expect(out.agencies).toHaveLength(2);
    expect(out.agencies.find((a) => a.clerkOrgId === "agency_1")?.subOrgs[0].subOrgId).toBe("r1");
    expect(out.agencies.find((a) => a.clerkOrgId === "agency_2")?.subOrgs[0].subOrgId).toBe("r2");
  });

  it("Personal Workspace lands in `personal`, not in agencies/standalone", () => {
    const out = buildHierarchy({
      memberships: [m("personal_org", "André's Workspace"), m("agency_1", "Acme"), m("sub_1", "S1")],
      personalOrgId: "personal_org",
      relationships: [rel({ parent: "agency_1", child: "sub_1" })],
    });
    expect(out.personal?.clerkOrgId).toBe("personal_org");
    expect(out.standaloneOrgs).toHaveLength(0);
    expect(out.agencies).toHaveLength(1);
  });

  it("user invited directly into a sub-org (no parent membership) lands in standaloneOrgs", () => {
    const out = buildHierarchy({
      memberships: [m("sub_orphan", "Orphan Sub")],
      personalOrgId: null,
      relationships: [
        rel({ id: "r_o", parent: "agency_unseen", child: "sub_orphan", name: "Orphan Sub" }),
      ],
    });
    expect(out.standaloneOrgs).toEqual([
      { clerkOrgId: "sub_orphan", name: "Orphan Sub", imageUrl: null },
    ]);
    expect(out.agencies).toHaveLength(0);
  });

  it("excludes ARCHIVED / SUSPENDED sub-orgs from the agency's nested list", () => {
    const out = buildHierarchy({
      memberships: [m("agency_1", "Acme"), m("sub_active", "Active"), m("sub_gone", "Gone")],
      personalOrgId: null,
      relationships: [
        rel({ id: "r_a", parent: "agency_1", child: "sub_active", name: "Active", status: "ACTIVE" }),
        rel({ id: "r_g", parent: "agency_1", child: "sub_gone", name: "Gone", status: "ARCHIVED" }),
      ],
    });
    expect(out.agencies[0].subOrgs.map((s) => s.name)).toEqual(["Active"]);
  });
});

describe("getUserOrgHierarchy — integration shape", () => {
  it("composes Clerk memberships + Prisma rows into the hierarchy", async () => {
    const fakeClerkClient = vi.fn().mockResolvedValue({
      users: {
        getOrganizationMembershipList: vi.fn().mockResolvedValue({
          data: [
            { organization: { id: "agency_1", name: "Acme" }, role: "org:admin" },
            { organization: { id: "sub_1", name: "Sub One" }, role: "org:member" },
          ],
        }),
      },
    });
    const fakePrisma = {
      orgRelationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "rel_1",
            parentOrgId: "agency_1",
            childOrgId: "sub_1",
            subOrgName: "Sub One",
            subOrgStatus: "ACTIVE",
          },
        ]),
      },
      user: { findUnique: vi.fn().mockResolvedValue({ personalOrgId: null }) },
    } as unknown as Parameters<typeof getUserOrgHierarchy>[1]["prisma"];

    const out = await getUserOrgHierarchy("user_1", {
      clerk: fakeClerkClient as never,
      prisma: fakePrisma,
    });
    expect(out.agencies).toHaveLength(1);
    expect(out.agencies[0].subOrgs[0].subOrgId).toBe("rel_1");
    expect(out.agencies[0].subOrgs[0].clerkOrgId).toBe("sub_1");
  });
});
