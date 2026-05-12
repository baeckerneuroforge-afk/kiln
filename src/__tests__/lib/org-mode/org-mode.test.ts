import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  orgRelationship: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { AGENCY_ONLY_PATHS, getOrgMode, getOrgModeDetails, isAgencyOnlyPath } from "@/lib/org-mode";

describe("org mode detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects a sub-org from child relationship", async () => {
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce({ id: "rel_child" });
    await expect(getOrgMode("org_child")).resolves.toBe("SUB_ORG");
  });

  it("detects an agency from parent relationship", async () => {
    mockPrisma.orgRelationship.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "rel_parent" });
    await expect(getOrgMode("org_agency")).resolves.toBe("AGENCY");
  });

  // Sprint 19.6.1 — STANDALONE removed. An org with no relationship rows
  // is still an AGENCY, just one that hasn't provisioned a sub-org yet.
  it("treats orgs without any relationship rows as AGENCY", async () => {
    mockPrisma.orgRelationship.findFirst.mockResolvedValue(null);
    await expect(getOrgMode("org_solo")).resolves.toBe("AGENCY");
  });

  it("checks child relationship before parent relationship", async () => {
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce({ id: "rel_child" });
    await getOrgMode("org_dual");
    expect(mockPrisma.orgRelationship.findFirst).toHaveBeenCalledTimes(1);
  });

  it("returns sub-org branding details", async () => {
    mockPrisma.orgRelationship.findFirst.mockResolvedValueOnce({
      parentOrgId: "org_parent",
      subOrgName: "Praxis Test",
      brandColor: "#f97316",
      logoUrl: "https://logo.test/logo.png",
    });
    await expect(getOrgModeDetails("org_child")).resolves.toMatchObject({
      mode: "SUB_ORG",
      parentOrgId: "org_parent",
      subOrgName: "Praxis Test",
      brandColor: "#f97316",
    });
  });

  it("falls back to mode detection for non-sub-org details", async () => {
    // Two findFirst calls: getOrgModeDetails (child check) +
    // getOrgMode (child check again). Both null → AGENCY.
    mockPrisma.orgRelationship.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await expect(getOrgModeDetails("org_agency")).resolves.toMatchObject({ mode: "AGENCY", parentOrgId: null });
  });

  it("marks exact agency-only paths", () => {
    expect(isAgencyOnlyPath("/dashboard/templates")).toBe(true);
    expect(isAgencyOnlyPath("/dashboard/onboarding")).toBe(true);
  });

  it("marks nested agency-only paths", () => {
    expect(isAgencyOnlyPath("/dashboard/templates/agents/template_1")).toBe(true);
    expect(isAgencyOnlyPath("/dashboard/admin/industry-packs")).toBe(true);
  });

  it("does not mark sub-org-safe paths as agency-only", () => {
    expect(isAgencyOnlyPath("/dashboard/agents")).toBe(false);
    expect(isAgencyOnlyPath("/dashboard/departments")).toBe(false);
  });

  it("exports the configured agency-only path list", () => {
    expect(AGENCY_ONLY_PATHS).toContain("/dashboard/templates");
    expect(AGENCY_ONLY_PATHS).toContain("/dashboard/operations");
  });
});
