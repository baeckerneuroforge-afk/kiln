// @vitest-environment jsdom

/**
 * Sprint 19.10 — PricingClient rendering + billing toggle math.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PricingClient } from "@/components/marketing/pricing-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const TIERS = [
  { key: "free" as const, monthly: 0, byok: null, cta: "startFree" as const, href: "/sign-up?tier=free", highlighted: false },
  { key: "starter" as const, monthly: 97, byok: 67, cta: "startNow" as const, href: "/sign-up?tier=starter", highlighted: false },
  { key: "professional" as const, monthly: 297, byok: 197, cta: "startNow" as const, href: "/sign-up?tier=professional", highlighted: true },
  { key: "agencyPro" as const, monthly: 497, byok: 347, cta: "startNow" as const, href: "/sign-up?tier=agency_pro", highlighted: false },
  { key: "enterprise" as const, monthly: null, byok: null, cta: "contactSales" as const, href: "mailto:sales@x", highlighted: false },
];

const MODULES = [
  { key: "voice" as const, monthly: 200 },
  { key: "browser" as const, monthly: 150 },
  { key: "emailOutbound" as const, monthly: 150 },
  { key: "computerUse" as const, monthly: 250 },
];

const COMPARISON = [
  { key: "memberSeats", free: "1", starter: "3", pro: "11", agencyPro: "Unlimited", enterprise: "Unlimited" },
  { key: "subOrgs", free: "1", starter: "10", pro: "50", agencyPro: "Unlimited", enterprise: "Unlimited" },
  { key: "support", free: "supportCommunity", starter: "supportEmail", pro: "supportPriority", agencyPro: "supportSlack", enterprise: "supportDedicated" },
];

const LABELS = {
  heroTitle: "Transparentes Pricing",
  heroSubtitle: "Ein Plan, vier Tiers",
  monthly: "Monatlich",
  yearly: "Jährlich (-20%)",
  perMonth: "/ Monat",
  custom: "Custom",
  mostPopular: "Most Popular",
  startNow: "Jetzt starten",
  startFree: "Kostenlos starten",
  forever: "Dauerhaft kostenlos",
  contactSales: "Sales kontaktieren",
  modulesTitle: "Module",
  modulesSubtitle: "Zubuchbar",
  byokTitle: "BYOK",
  byokSubtitle: "Spare mit eigenen Keys",
  byokExplanation: "Explanation",
  byokColOriginal: "Original",
  byokColBYOK: "Mit BYOK",
  comparisonTitle: "Vergleich",
  comparisonSubtitle: "Welcher Plan",
  finalCtaTitle: "Bereit?",
  finalCtaSubtitle: "14 Tage trial",
  finalCtaButton: "Jetzt starten",
  tierNames: { free: "Free", starter: "Starter", professional: "Professional", agencyPro: "Agency Pro", enterprise: "Enterprise" },
  tierSubtitles: { free: "F sub", starter: "S sub", professional: "P sub", agencyPro: "AP sub", enterprise: "E sub" },
  tierFeatures: {
    free: ["f0a", "f0b"],
    starter: ["f1", "f2"],
    professional: ["f3", "f4"],
    agencyPro: ["f5"],
    enterprise: ["f6"],
  },
  moduleNames: { voice: "Voice", browser: "Browser", emailOutbound: "Email", computerUse: "CU" },
  moduleDescriptions: { voice: "voiced", browser: "browd", emailOutbound: "emaild", computerUse: "cud" },
  comparisonLabels: {
    memberSeats: "Member-Seats",
    subOrgs: "Sub-Orgs",
    monthlyConversations: "Conversations / Monat",
    agents: "Agenten",
    support: "Support",
    supportCommunity: "Community",
    supportEmail: "Email",
    supportPriority: "Priority",
    supportSlack: "Slack",
    supportDedicated: "Manager",
  },
};

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("PricingClient", () => {
  it("renders all 5 tier cards (incl. Free)", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    expect(screen.getByTestId("pricing-tier-free")).toBeTruthy();
    expect(screen.getByTestId("pricing-tier-starter")).toBeTruthy();
    expect(screen.getByTestId("pricing-tier-professional")).toBeTruthy();
    expect(screen.getByTestId("pricing-tier-agencyPro")).toBeTruthy();
    expect(screen.getByTestId("pricing-tier-enterprise")).toBeTruthy();
  });

  it("Free tier renders €0 + forever label (no yearly discount applied)", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    const free = screen.getByTestId("pricing-tier-free");
    expect(free.textContent).toContain("€0");
    expect(free.textContent).toContain("Dauerhaft kostenlos");
    expect(free.textContent).not.toContain("/ Monat");

    // Toggle to yearly — Free should not change (stays €0 forever).
    fireEvent.click(screen.getByTestId("billing-toggle-yearly"));
    expect(free.textContent).toContain("€0");
  });

  it("Free tier CTA renders startFree label and links to /sign-up?tier=free", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    const cta = screen.getByTestId("pricing-tier-free-cta");
    expect(cta.textContent).toContain("Kostenlos starten");
    expect(cta.getAttribute("href")).toBe("/sign-up?tier=free");
  });

  it("BYOK table does not list a row for Free (byok=null)", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    expect(screen.queryByTestId("pricing-byok-row-free")).toBeNull();
  });

  it("renders monthly tier prices: 97 / 297 / 497", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    expect(screen.getByTestId("pricing-tier-starter").textContent).toContain("€97");
    expect(screen.getByTestId("pricing-tier-professional").textContent).toContain("€297");
    expect(screen.getByTestId("pricing-tier-agencyPro").textContent).toContain("€497");
    expect(screen.getByTestId("pricing-tier-enterprise").textContent).toContain("Custom");
  });

  it("yearly toggle applies -20% discount (rounded)", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    fireEvent.click(screen.getByTestId("billing-toggle-yearly"));
    // 97 * 0.8 = 77.6 → rounds to 78
    expect(screen.getByTestId("pricing-tier-starter").textContent).toContain("€78");
    // 297 * 0.8 = 237.6 → 238
    expect(screen.getByTestId("pricing-tier-professional").textContent).toContain("€238");
    // 497 * 0.8 = 397.6 → 398
    expect(screen.getByTestId("pricing-tier-agencyPro").textContent).toContain("€398");
  });

  it("Most-Popular badge only on Professional tier", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    expect(screen.getByTestId("pricing-tier-professional-badge")).toBeTruthy();
    expect(screen.queryByTestId("pricing-tier-starter-badge")).toBeNull();
    expect(screen.queryByTestId("pricing-tier-agencyPro-badge")).toBeNull();
  });

  it("Enterprise CTA links to mailto, others link to /sign-up?tier=…", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    expect(
      screen.getByTestId("pricing-tier-starter-cta").getAttribute("href"),
    ).toBe("/sign-up?tier=starter");
    expect(
      screen.getByTestId("pricing-tier-enterprise-cta").getAttribute("href"),
    ).toMatch(/^mailto:/);
  });

  it("renders all 4 module cards with correct prices", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    expect(screen.getByTestId("pricing-module-voice").textContent).toContain("€200");
    expect(screen.getByTestId("pricing-module-browser").textContent).toContain("€150");
    expect(screen.getByTestId("pricing-module-emailOutbound").textContent).toContain("€150");
    expect(screen.getByTestId("pricing-module-computerUse").textContent).toContain("€250");
  });

  it("BYOK section shows discounted prices 67 / 197 / 347 (no row for Enterprise)", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    expect(screen.getByTestId("pricing-byok-row-starter").textContent).toContain("€67");
    expect(screen.getByTestId("pricing-byok-row-professional").textContent).toContain("€197");
    expect(screen.getByTestId("pricing-byok-row-agencyPro").textContent).toContain("€347");
    expect(screen.queryByTestId("pricing-byok-row-enterprise")).toBeNull();
  });

  it("comparison support row uses translated labels (not raw keys)", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    const row = screen.getByTestId("pricing-comparison-row-support");
    // Raw key "supportEmail" is replaced with "Email" via comparisonLabels.
    expect(row.textContent).toContain("Email");
    expect(row.textContent).toContain("Priority");
    expect(row.textContent).toContain("Slack");
    expect(row.textContent).toContain("Manager");
    expect(row.textContent).not.toContain("supportEmail");
  });

  it("final CTA links to /sign-up", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    expect(
      screen.getByTestId("pricing-final-cta-button").getAttribute("href"),
    ).toBe("/sign-up");
  });
});
