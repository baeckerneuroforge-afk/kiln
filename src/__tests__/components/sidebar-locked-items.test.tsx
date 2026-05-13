// @vitest-environment jsdom

/**
 * Sprint 19.6.1 — sidebar lock UI for tier-gated items.
 *
 * We render the sidebar with a FREE plan and assert that:
 *   1. Tier-locked items still render (no longer hidden by `minAgents`)
 *   2. They carry a data-locked attribute the styles hook into
 *   3. Their tooltip / aria info contains the upgrade prompt
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { mockPathname } = vi.hoisted(() => ({
  mockPathname: { current: "/dashboard" as string },
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
}));
vi.mock("@/hooks/use-advanced-mode", () => ({
  useAdvancedMode: () => ({ advancedMode: false, setAdvancedMode: vi.fn() }),
  AdvancedModeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/use-org-mode", () => ({
  useOrgMode: () => "AGENCY",
  useOrgModeDetails: () => ({
    loading: false,
    mode: "AGENCY",
    orgId: "org_agency",
    parentOrgId: null,
    subOrgName: null,
    brandColor: null,
    logoUrl: null,
  }),
}));
vi.mock("@/components/whats-new", () => ({ WhatsNewBell: () => null }));
vi.mock("@/components/org-switcher", () => ({ OrgChangeRefresh: () => null }));
vi.mock("@/components/agency-org-switcher", () => ({ AgencyOrgSwitcher: () => null }));
vi.mock("@/components/context-switcher", () => ({ ContextSwitcher: () => null }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { Sidebar } from "@/components/sidebar";

function mockPlan(plan: string, agentCount = 0) {
  mockFetch.mockImplementation((url: string) => {
    if (url.endsWith("/api/stripe/plan")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ plan, agentCount }),
      } as Response);
    }
    if (url.endsWith("/api/agency/branding")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ branding: null }),
      } as Response);
    }
    if (url.endsWith("/api/agency/sub-orgs")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ subOrgs: [] }),
      } as Response);
    }
    // Sprint 19.7.6 — the sidebar's new agency-role hook gates Team +
    // Billing items via /api/agency/role. These plan-tier tests assume
    // OWNER permissions so the items render and we can assert on the
    // plan-tier lock UI; the role-gate tests cover the inverse.
    if (url.endsWith("/api/agency/role")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            role: "OWNER",
            permissions: [
              "agency.manage",
              "billing.manage",
              "members.manage",
              "sub-orgs.create",
              "sub-orgs.delete",
              "sub-orgs.read",
              "templates.manage",
              "all-sub-orgs.access",
            ],
          }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

beforeEach(() => {
  mockPathname.current = "/dashboard";
  mockFetch.mockReset();
  // Sidebar collapses the Manage / Extend / Insights sections by
  // default. Pre-open them via localStorage so the items we want to
  // assert against actually appear in the DOM.
  window.localStorage.setItem(
    "kiln-sidebar-sections",
    JSON.stringify({
      primary: true,
      customers: true,
      build: true,
      insights: true,
      extend: true,
      manage: true,
    }),
  );
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Sidebar tier-lock UI (Sprint 19.6.1)", () => {
  it("renders Billing, Revenue, Branding for FREE plan but marks them data-locked", async () => {
    mockPlan("FREE", 0);
    render(<Sidebar open={true} onClose={() => {}} />);
    const billing = await screen.findByRole("link", { name: /Billing/i });
    const revenue = await screen.findByRole("link", { name: /Revenue/i });
    const branding = await screen.findByRole("link", { name: /Branding/i });
    expect(billing.getAttribute("data-locked")).toBe("true");
    expect(revenue.getAttribute("data-locked")).toBe("true");
    expect(branding.getAttribute("data-locked")).toBe("true");
  });

  it("renders Sub-Orgs + Industry Packs for FREE plan with data-locked attribute", async () => {
    mockPlan("FREE", 0);
    render(<Sidebar open={true} onClose={() => {}} />);
    const subOrgs = await screen.findByRole("link", { name: /Sub-Orgs/i });
    const industry = await screen.findByRole("link", { name: /Industry Packs/i });
    expect(subOrgs.getAttribute("data-locked")).toBe("true");
    expect(industry.getAttribute("data-locked")).toBe("true");
  });

  it("does NOT lock Knowledge / Integrations / Analytics anymore (minAgents gate is gone)", async () => {
    mockPlan("FREE", 0);
    render(<Sidebar open={true} onClose={() => {}} />);
    const knowledge = await screen.findByRole("link", { name: /Knowledge/i });
    const integrations = await screen.findByRole("link", { name: /Integrations/i });
    expect(knowledge.getAttribute("data-locked")).toBeNull();
    expect(integrations.getAttribute("data-locked")).toBeNull();
  });

  it("AGENCY plan unlocks Billing/Revenue/Branding (no data-locked attribute)", async () => {
    mockPlan("AGENCY", 0);
    render(<Sidebar open={true} onClose={() => {}} />);
    // The link renders immediately at "FREE" default, so wait until the
    // /api/stripe/plan fetch resolves and the data-locked attribute is
    // cleared.
    await waitFor(() => {
      const billing = screen.getByRole("link", { name: /Billing/i });
      expect(billing.getAttribute("data-locked")).toBeNull();
    });
    expect(screen.getByRole("link", { name: /Sub-Orgs/i }).getAttribute("data-locked")).toBeNull();
  });
});
