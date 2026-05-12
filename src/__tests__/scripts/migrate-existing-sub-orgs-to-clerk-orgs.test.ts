/**
 * Sprint 19.7.1 — backfill script for existing sub-orgs.
 *
 * Focus is on the pure functions: option parsing + per-row planning /
 * application via injected clerk + prisma stubs.
 */
import { describe, expect, it, vi } from "vitest";
import type { OrgRelationship } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    orgRelationship: { findMany: vi.fn() },
    subOrgMembership: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
}));

import {
  backfillSubOrg,
  parseCliOptions,
} from "../../../scripts/migrate-existing-sub-orgs-to-clerk-orgs";

function makeRel(overrides: Partial<OrgRelationship> = {}): OrgRelationship {
  return {
    id: "sub_1",
    parentOrgId: "org_agency_1",
    childOrgId: "org_child_1",
    createdAt: new Date("2026-04-01T00:00:00Z"),
    createdBy: "user_owner",
    subOrgName: "Acme",
    subOrgStatus: "ACTIVE",
    pricingMode: "NONE",
    monthlyPriceCents: null,
    setupFeeCents: null,
    pricingCurrency: "eur",
    trialDays: null,
    stripeProductId: null,
    stripeMonthlyPriceId: null,
    stripeSetupPriceId: null,
    industry: null,
    onboardedVia: "MANUAL",
    onboardingDuration: null,
    onboardedAt: null,
    brandColor: null,
    logoUrl: null,
    customSubdomain: null,
    emailSignature: null,
    emailBrandOverride: null,
    ...overrides,
  } as OrgRelationship;
}

describe("parseCliOptions", () => {
  it("--dry-run sets dryRun=true", () => {
    expect(parseCliOptions(["--dry-run"]).dryRun).toBe(true);
  });

  it("--live sets dryRun=false", () => {
    expect(parseCliOptions(["--live"]).dryRun).toBe(false);
  });

  it("requires either --dry-run or --live", () => {
    expect(() => parseCliOptions([])).toThrow(/Refusing to guess/);
  });

  it("rejects passing both --dry-run and --live", () => {
    expect(() => parseCliOptions(["--dry-run", "--live"])).toThrow(/mutually exclusive/);
  });

  it("--sub-orgs=a,b parses into a string list", () => {
    expect(parseCliOptions(["--dry-run", "--sub-orgs=a,b,c"]).subOrgIds).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

function makeDeps(opts: {
  publicMetadata?: Record<string, unknown>;
  existingMembership?: {
    id: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    permissionSet: "READ_ONLY" | "USE_AGENTS" | "USE_AGENTS_PLUS_KNOWLEDGE" | "FULL_ACCESS";
  } | null;
}) {
  const getOrg = vi.fn().mockResolvedValue({ publicMetadata: opts.publicMetadata ?? {} });
  const updateOrg = vi.fn().mockResolvedValue({});
  const findUnique = vi.fn().mockResolvedValue(opts.existingMembership ?? null);
  const create = vi.fn().mockResolvedValue({});
  const update = vi.fn().mockResolvedValue({});
  const clerk = vi.fn().mockResolvedValue({
    organizations: { getOrganization: getOrg, updateOrganization: updateOrg },
  });
  const prismaClient = {
    subOrgMembership: { findUnique, create, update },
  } as unknown as Parameters<typeof backfillSubOrg>[1] extends infer D
    ? D extends undefined
      ? never
      : NonNullable<Parameters<typeof backfillSubOrg>[1]>["prismaClient"]
    : never;
  return { clerk: clerk as never, prismaClient, getOrg, updateOrg, findUnique, create, update };
}

describe("backfillSubOrg", () => {
  it("dry-run with missing metadata and missing membership → ready, no writes", async () => {
    const deps = makeDeps({ publicMetadata: {} });
    const res = await backfillSubOrg(
      { relationship: makeRel(), dryRun: true },
      { clerk: deps.clerk, prismaClient: deps.prismaClient as never },
    );
    expect(res.action).toBe("ready");
    expect(res.reasons).toEqual(["clerk-metadata-set", "owner-membership-created"]);
    expect(deps.updateOrg).not.toHaveBeenCalled();
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("live: patches Clerk metadata and creates the OWNER membership", async () => {
    const deps = makeDeps({ publicMetadata: {} });
    const res = await backfillSubOrg(
      { relationship: makeRel(), dryRun: false },
      { clerk: deps.clerk, prismaClient: deps.prismaClient as never },
    );
    expect(res.action).toBe("updated");
    expect(deps.updateOrg).toHaveBeenCalledWith("org_child_1", {
      publicMetadata: { kiln_type: "sub_org", parentAgencyOrgId: "org_agency_1" },
    });
    expect(deps.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subOrgId: "sub_1",
        userId: "user_owner",
        role: "OWNER",
        permissionSet: "FULL_ACCESS",
      }),
    });
  });

  it("skips when both Clerk metadata and OWNER membership are already correct", async () => {
    const deps = makeDeps({
      publicMetadata: { kiln_type: "sub_org", parentAgencyOrgId: "org_agency_1" },
      existingMembership: { id: "mem_x", role: "OWNER", permissionSet: "FULL_ACCESS" },
    });
    const res = await backfillSubOrg(
      { relationship: makeRel(), dryRun: false },
      { clerk: deps.clerk, prismaClient: deps.prismaClient as never },
    );
    expect(res.action).toBe("skipped");
    expect(res.reasons).toEqual(["already-current"]);
    expect(deps.updateOrg).not.toHaveBeenCalled();
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("upgrades an existing non-OWNER membership row to OWNER/FULL_ACCESS", async () => {
    const deps = makeDeps({
      publicMetadata: { kiln_type: "sub_org", parentAgencyOrgId: "org_agency_1" },
      existingMembership: { id: "mem_x", role: "MEMBER", permissionSet: "READ_ONLY" },
    });
    const res = await backfillSubOrg(
      { relationship: makeRel(), dryRun: false },
      { clerk: deps.clerk, prismaClient: deps.prismaClient as never },
    );
    expect(res.action).toBe("updated");
    expect(res.reasons).toContain("owner-membership-upgraded");
    expect(deps.update).toHaveBeenCalledWith({
      where: { id: "mem_x" },
      data: { role: "OWNER", permissionSet: "FULL_ACCESS" },
    });
  });

  it("preserves unrelated publicMetadata keys when patching", async () => {
    const deps = makeDeps({
      publicMetadata: { someExisting: "value" },
      existingMembership: { id: "mem_x", role: "OWNER", permissionSet: "FULL_ACCESS" },
    });
    await backfillSubOrg(
      { relationship: makeRel(), dryRun: false },
      { clerk: deps.clerk, prismaClient: deps.prismaClient as never },
    );
    expect(deps.updateOrg).toHaveBeenCalledWith("org_child_1", {
      publicMetadata: {
        someExisting: "value",
        kiln_type: "sub_org",
        parentAgencyOrgId: "org_agency_1",
      },
    });
  });

  it("isolates per-row failures and reports them as action='failed'", async () => {
    const deps = makeDeps({ publicMetadata: {} });
    deps.clerk.mockResolvedValueOnce({
      organizations: {
        getOrganization: vi.fn().mockRejectedValueOnce(new Error("Clerk fetch boom")),
        updateOrganization: deps.updateOrg,
      },
    });
    const res = await backfillSubOrg(
      { relationship: makeRel(), dryRun: false },
      { clerk: deps.clerk, prismaClient: deps.prismaClient as never },
    );
    expect(res.action).toBe("failed");
    expect(res.error).toContain("Clerk fetch boom");
  });
});
