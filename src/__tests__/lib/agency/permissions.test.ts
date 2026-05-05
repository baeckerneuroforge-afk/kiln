import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env.ADMIN_USER_IDS;
const ADMIN_USER = "user_admin_agency_test";

beforeAll(() => {
  process.env.ADMIN_USER_IDS = ADMIN_USER;
});
afterAll(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.ADMIN_USER_IDS;
  } else {
    process.env.ADMIN_USER_IDS = ORIGINAL_ENV;
  }
});

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  orgRelationship: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  canCreateSubOrg,
  canManageSubOrgs,
  getMaxSubOrgs,
  isAgencyTierPlan,
} from "@/lib/agency/permissions";

describe("isAgencyTierPlan", () => {
  it("returns true for BUSINESS, AGENCY, and ENTERPRISE", () => {
    expect(isAgencyTierPlan("BUSINESS")).toBe(true);
    expect(isAgencyTierPlan("AGENCY")).toBe(true);
    expect(isAgencyTierPlan("ENTERPRISE")).toBe(true);
  });

  it("returns false for FREE / STARTER / PRO and null/undefined", () => {
    expect(isAgencyTierPlan("FREE")).toBe(false);
    expect(isAgencyTierPlan("STARTER")).toBe(false);
    expect(isAgencyTierPlan("PRO")).toBe(false);
    expect(isAgencyTierPlan(null)).toBe(false);
    expect(isAgencyTierPlan(undefined)).toBe(false);
  });
});

describe("getMaxSubOrgs", () => {
  it("returns the per-tier cap", () => {
    expect(getMaxSubOrgs("BUSINESS")).toBe(5);
    // AGENCY + ENTERPRISE are unlimited; we encode that as 999999 because
    // Infinity does not survive JSON.stringify (becomes null).
    expect(getMaxSubOrgs("AGENCY")).toBe(999999);
    expect(getMaxSubOrgs("ENTERPRISE")).toBe(999999);
  });

  it("returns 0 for plans without sub-org support", () => {
    expect(getMaxSubOrgs("FREE")).toBe(0);
    expect(getMaxSubOrgs("PRO")).toBe(0);
  });
});

describe("canCreateSubOrg", () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockReset();
    mockPrisma.orgRelationship.count.mockReset();
  });

  it("admin: bypasses plan + capacity, returns max=999999 without DB hit", async () => {
    const r = await canCreateSubOrg(ADMIN_USER, "org_x");
    expect(r).toEqual({ allowed: true, max: 999999, current: 0 });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.orgRelationship.count).not.toHaveBeenCalled();
  });

  it("rejects users we don't have a row for (no_plan)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const r = await canCreateSubOrg("user_unknown", "org_x");
    expect(r.allowed).toBe(false);
    expect((r as { reason: string }).reason).toBe("no_plan");
  });

  it("rejects FREE/PRO plans (wrong_tier)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "PRO" });
    const r = await canCreateSubOrg("user_pro", "org_x");
    expect(r.allowed).toBe(false);
    expect((r as { reason: string }).reason).toBe("wrong_tier");
  });

  it("allows AGENCY when under capacity", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(10);
    const r = await canCreateSubOrg("user_agency", "org_x");
    expect(r).toEqual({ allowed: true, max: 999999, current: 10 });
  });

  it("rejects BUSINESS when capacity reached at 5", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "BUSINESS" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(5);
    const r = await canCreateSubOrg("user_biz", "org_x");
    expect(r.allowed).toBe(false);
    expect((r as { reason: string }).reason).toBe("capacity_reached");
    expect((r as { current: number; max: number }).current).toBe(5);
    expect((r as { current: number; max: number }).max).toBe(5);
  });

  it("allows BUSINESS when under the 5-suborg cap", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "BUSINESS" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(2);
    const r = await canCreateSubOrg("user_biz", "org_x");
    expect(r).toEqual({ allowed: true, max: 5, current: 2 });
  });

  it("ENTERPRISE is unlimited (999999)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "ENTERPRISE" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(50);
    const r = await canCreateSubOrg("user_ent", "org_x");
    expect(r).toEqual({ allowed: true, max: 999999, current: 50 });
  });
});

describe("canManageSubOrgs", () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockReset();
    mockPrisma.orgRelationship.count.mockReset();
  });

  it("returns true for admin (bypass)", async () => {
    expect(await canManageSubOrgs(ADMIN_USER, "org_x")).toBe(true);
  });

  it("returns true for AGENCY at capacity (manage existing still allowed)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(25);
    expect(await canManageSubOrgs("user_agency", "org_x")).toBe(true);
  });

  it("returns false for PRO (wrong_tier)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "PRO" });
    expect(await canManageSubOrgs("user_pro", "org_x")).toBe(false);
  });

  it("returns false when user record is missing", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    expect(await canManageSubOrgs("user_unknown", "org_x")).toBe(false);
  });
});
