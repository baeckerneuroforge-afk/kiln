import { describe, expect, it } from "vitest";
import {
  AGENCY_NAV_SECTIONS,
  STANDALONE_NAV_SECTIONS,
  SUB_ORG_NAV_SECTIONS,
} from "@/components/sidebar";

const AGENCY_PRIMARY_ITEMS = AGENCY_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href));

describe("AGENCY_NAV_SECTIONS after Sprint 19.6 consolidation", () => {
  it("is consolidated down from the previous ~32 items to ≤16", () => {
    // Sprint 19.6 spec asked for "14"; the concrete listed items in the
    // spec actually summed to 17 (16 here without /help, which lives in a
    // header-area Help button and not in the side nav). 16 is the right
    // floor: anything higher means the consolidation regressed.
    expect(AGENCY_PRIMARY_ITEMS.length).toBeLessThanOrEqual(16);
    expect(AGENCY_PRIMARY_ITEMS.length).toBeGreaterThanOrEqual(14);
  });

  it("ships the 6 canonical sections in order: PRIMARY, Customers, Build, Insights, Extend, Manage", () => {
    expect(AGENCY_NAV_SECTIONS.map((section) => section.id)).toEqual([
      "primary",
      "customers",
      "build",
      "insights",
      "extend",
      "manage",
    ]);
  });

  it("PRIMARY section is just the Dashboard link with no section label", () => {
    const primary = AGENCY_NAV_SECTIONS[0];
    expect(primary.label).toBeNull();
    expect(primary.items).toHaveLength(1);
    expect(primary.items[0]).toMatchObject({ name: "Dashboard", href: "/dashboard" });
  });

  it("no longer surfaces /dashboard/operations as its own sidebar entry", () => {
    expect(AGENCY_PRIMARY_ITEMS).not.toContain("/dashboard/operations");
  });

  it("no longer surfaces /dashboard/onboarding, /dashboard/computer-use, /dashboard/agent-swarm, /dashboard/deep-research, /dashboard/orchestration", () => {
    for (const href of [
      "/dashboard/onboarding",
      "/dashboard/computer-use",
      "/dashboard/agent-swarm",
      "/dashboard/deep-research",
      "/dashboard/orchestration",
    ]) {
      expect(AGENCY_PRIMARY_ITEMS).not.toContain(href);
    }
  });

  it("no longer surfaces standalone LLM Usage / Monitoring / A/B Tests / Nodes SDK / Shared / Email Branding / Data Explorer / Templates / Clients", () => {
    for (const href of [
      "/dashboard/llm-usage",
      "/dashboard/teams/monitor",
      "/dashboard/teams/ab-tests",
      "/dashboard/nodes-marketplace",
      "/dashboard/shared",
      "/dashboard/agency/email-branding",
      "/dashboard/data-explorer",
      "/dashboard/templates/agents",
      "/dashboard/clients",
    ]) {
      expect(AGENCY_PRIMARY_ITEMS).not.toContain(href);
    }
  });

  it("keeps the eight remaining core destinations reachable via sidebar", () => {
    for (const href of [
      "/dashboard",
      "/dashboard/agency/sub-orgs",
      "/dashboard/conversations",
      "/dashboard/agents",
      "/dashboard/teams",
      "/dashboard/departments",
      "/dashboard/knowledge",
      "/dashboard/integrations",
      "/dashboard/intelligence",
      "/marketplace",
      "/dashboard/admin/industry-packs",
      "/developers",
      "/dashboard/agency/billing",
      "/dashboard/agency/revenue",
      "/dashboard/agency/branding",
      "/dashboard/settings",
    ]) {
      expect(AGENCY_PRIMARY_ITEMS).toContain(href);
    }
  });

  it("hrefs are unique — no duplicates after consolidation", () => {
    expect(new Set(AGENCY_PRIMARY_ITEMS).size).toBe(AGENCY_PRIMARY_ITEMS.length);
  });
});

describe("Sub-Org and Standalone nav still functional", () => {
  it("SUB_ORG_NAV_SECTIONS unchanged in shape", () => {
    expect(SUB_ORG_NAV_SECTIONS).toHaveLength(1);
    expect(SUB_ORG_NAV_SECTIONS[0].id).toBe("sub-org-core");
  });

  it("STANDALONE_NAV_SECTIONS mirrors AGENCY without agency-tier-only items", () => {
    expect(STANDALONE_NAV_SECTIONS).toHaveLength(AGENCY_NAV_SECTIONS.length);
    // Sub-Orgs section requires agency tier; standalone drops it from the
    // Customers section, leaving Conversations only.
    const standaloneCustomers = STANDALONE_NAV_SECTIONS.find((section) => section.id === "customers");
    expect(standaloneCustomers?.items.map((item) => item.href)).not.toContain("/dashboard/agency/sub-orgs");
  });
});
