import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/hooks/use-advanced-mode", () => ({
  useAdvancedMode: () => ({ advancedMode: false, setAdvancedMode: vi.fn() }),
}));

import {
  AGENCY_NAV_SECTIONS,
  SUB_ORG_NAV_SECTIONS,
  getSidebarSectionsForMode,
} from "@/components/sidebar";

type Mode = "AGENCY" | "SUB_ORG";

function itemNames(mode: Mode): string[] {
  return getSidebarSectionsForMode(mode).flatMap((section) => section.items.map((item) => item.name));
}

function itemHrefs(mode: Mode): string[] {
  return getSidebarSectionsForMode(mode).flatMap((section) => section.items.map((item) => item.href));
}

describe("sidebar org-mode navigation", () => {
  it("returns agency navigation for agency mode", () => {
    expect(getSidebarSectionsForMode("AGENCY")).toBe(AGENCY_NAV_SECTIONS);
  });

  it("returns sub-org navigation for sub-org mode", () => {
    expect(getSidebarSectionsForMode("SUB_ORG")).toBe(SUB_ORG_NAV_SECTIONS);
  });

  it("no longer surfaces Templates as a top-level sidebar item after Sprint 19.6", () => {
    // Templates is reachable via /dashboard/templates/agents but lives
    // under the future Workflows-tabs consolidation. It's intentionally
    // removed from the sidebar.
    expect(itemNames("AGENCY")).not.toContain("Templates");
  });

  it("includes industry packs for agencies", () => {
    expect(itemNames("AGENCY")).toContain("Industry Packs");
  });

  it("hides agency-only routes from sub-orgs", () => {
    expect(itemHrefs("SUB_ORG")).not.toContain("/dashboard/templates/agents");
    expect(itemHrefs("SUB_ORG")).not.toContain("/dashboard/onboarding");
  });

  it("hides operations from sub-orgs", () => {
    expect(itemHrefs("SUB_ORG")).not.toContain("/dashboard/operations");
  });

  it("shows customer-owned labels in sub-org mode", () => {
    expect(itemNames("SUB_ORG")).toEqual(
      expect.arrayContaining(["Meine Departments", "Meine Agents", "Meine Workflows", "Meine Conversations"])
    );
  });

  it("keeps knowledge and integrations visible for sub-orgs", () => {
    expect(itemNames("SUB_ORG")).toEqual(expect.arrayContaining(["Meine Knowledge Base", "Meine Integrationen"]));
  });
});
