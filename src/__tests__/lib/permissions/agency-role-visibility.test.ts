/**
 * Sprint 19.7.6 — sidebar item visibility table per AgencyRole.
 *
 * Symbolic: which Manage-section items can each role see?
 *
 *   OWNER       → Team + Billing + Revenue + Branding + Settings
 *   ADMIN       → Team + Revenue + Branding + Settings        (no Billing)
 *   CONSULTANT  → Settings only
 *   VIEWER      → Settings only
 *
 * The actual NavItem list lives in Sidebar; this test exercises the
 * permissions matrix the visibility check is built on, so failures
 * here point at the matrix rather than at the JSX.
 */
import { describe, expect, it } from "vitest";
import type { AgencyRole } from "@prisma/client";
import {
  permissionsForAgencyRole,
  type AgencyPermission,
} from "@/lib/permissions/agency-permissions";

type Item = { name: string; requiresAgencyPermission?: AgencyPermission };

const MANAGE_ITEMS: Item[] = [
  { name: "Team", requiresAgencyPermission: "members.manage" },
  { name: "Billing", requiresAgencyPermission: "billing.manage" },
  { name: "Revenue" },
  { name: "Branding" },
  { name: "Settings" },
];

function visibleItemsForRole(role: AgencyRole): string[] {
  const perms = permissionsForAgencyRole(role);
  return MANAGE_ITEMS.filter((i) =>
    i.requiresAgencyPermission ? perms.has(i.requiresAgencyPermission) : true,
  ).map((i) => i.name);
}

describe("Sidebar Manage-section visibility per AgencyRole", () => {
  it("OWNER sees Team, Billing, Revenue, Branding, Settings", () => {
    expect(visibleItemsForRole("OWNER")).toEqual([
      "Team",
      "Billing",
      "Revenue",
      "Branding",
      "Settings",
    ]);
  });

  it("ADMIN sees Team but not Billing", () => {
    const items = visibleItemsForRole("ADMIN");
    expect(items).toContain("Team");
    expect(items).not.toContain("Billing");
  });

  it("CONSULTANT sees neither Team nor Billing", () => {
    const items = visibleItemsForRole("CONSULTANT");
    expect(items).not.toContain("Team");
    expect(items).not.toContain("Billing");
    expect(items).toContain("Settings");
  });

  it("VIEWER sees neither Team nor Billing", () => {
    const items = visibleItemsForRole("VIEWER");
    expect(items).not.toContain("Team");
    expect(items).not.toContain("Billing");
    expect(items).toContain("Settings");
  });
});
