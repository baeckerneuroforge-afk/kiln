// @vitest-environment jsdom

/**
 * Sprint 19.10 — PricingClient rendering + billing toggle math.
 * Sprint 20.1.1 — Tier-CTA click handler (logged-in direct checkout,
 * logged-out sign-up redirect, enterprise mailto).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PricingClient } from "@/components/marketing/pricing-client";

const mockPush = vi.hoisted(() => vi.fn());
const mockUseUser = vi.hoisted(() =>
  vi.fn(() => ({ isLoaded: true, isSignedIn: false })),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: mockPush }),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: mockUseUser,
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
  mockPush.mockReset();
  // Default to logged-out so existing tests behave the same as
  // Sprint 19.10. Logged-in tests override via mockUseUser.mockReturnValueOnce.
  mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: false });
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
    // Sprint 20.1.1 — CTA is now a <button>; click routes to /sign-up.
    fireEvent.click(cta);
    expect(mockPush).toHaveBeenCalledWith("/sign-up?tier=free");
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

  it("Logged-out: paid CTA pushes /sign-up?tier=<api> via router", () => {
    render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
    fireEvent.click(screen.getByTestId("pricing-tier-starter-cta"));
    expect(mockPush).toHaveBeenCalledWith("/sign-up?tier=starter");

    // Agency Pro uses underscore (Sprint 20.1.1 fix — was "agency-pro").
    fireEvent.click(screen.getByTestId("pricing-tier-agencyPro-cta"));
    expect(mockPush).toHaveBeenCalledWith("/sign-up?tier=agency_pro");
  });

  it("Enterprise CTA always redirects to mailto, regardless of auth state", () => {
    // Mock window.location so we can detect the mailto navigation.
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });
    try {
      render(
        <PricingClient
          tiers={TIERS}
          modules={MODULES}
          comparisonRows={COMPARISON}
          labels={LABELS}
        />,
      );
      fireEvent.click(screen.getByTestId("pricing-tier-enterprise-cta"));
      expect(window.location.href).toMatch(/^mailto:sales@/);
    } finally {
      Object.defineProperty(window, "location", {
        writable: true,
        value: originalLocation,
      });
    }
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

/* ── Sprint 20.1.1 — Logged-in tier-CTA branch ────────────────────────── */

describe("PricingClient — logged-in click handler", () => {
  beforeEach(() => {
    mockPush.mockReset();
    // window.location.href is mutated by the enterprise + Stripe-redirect
    // branches; reset per test to avoid leakage.
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });
    mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderClient() {
    return render(
      <PricingClient
        tiers={TIERS}
        modules={MODULES}
        comparisonRows={COMPARISON}
        labels={LABELS}
      />,
    );
  }

  it("Logged-in + free → router.push /dashboard (not /sign-up)", () => {
    renderClient();
    fireEvent.click(screen.getByTestId("pricing-tier-free-cta"));
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("Logged-in + paid → POST /api/billing/upgrade with API tier id", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ checkoutUrl: "https://checkout.stripe.com/abc" }),
    });
    renderClient();
    fireEvent.click(screen.getByTestId("pricing-tier-agencyPro-cta"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/billing/upgrade",
        expect.objectContaining({
          method: "POST",
          // Sprint 20.1.1 — underscore is the API contract.
          body: JSON.stringify({ targetTier: "agency_pro" }),
        }),
      );
    });
  });

  it("Logged-in + paid → window.location redirects to checkoutUrl on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ checkoutUrl: "https://checkout.stripe.com/abc" }),
    });
    renderClient();
    fireEvent.click(screen.getByTestId("pricing-tier-starter-cta"));
    await waitFor(() => {
      expect(window.location.href).toBe("https://checkout.stripe.com/abc");
    });
  });

  it("Logged-in + paid → loading spinner while fetch is in flight", async () => {
    let resolve: ((v: unknown) => void) | undefined;
    global.fetch = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderClient();
    fireEvent.click(screen.getByTestId("pricing-tier-starter-cta"));
    await waitFor(() => {
      expect(
        screen
          .getByTestId("pricing-tier-starter-cta")
          .getAttribute("data-loading"),
      ).toBe("true");
    });
    // Unblock — let the promise resolve so the test doesn't dangle.
    resolve?.({ ok: true, json: async () => ({ checkoutUrl: "https://x" }) });
  });

  it("Logged-in + paid → 503 surfaces user-friendly Stripe-not-configured copy", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Stripe price not configured for tier starter" }),
    });
    renderClient();
    fireEvent.click(screen.getByTestId("pricing-tier-starter-cta"));
    await waitFor(() => {
      const err = screen.getByTestId("pricing-tier-error");
      expect(err.textContent).toContain("temporarily unavailable");
      // Raw Stripe error must NOT leak through.
      expect(err.textContent).not.toContain("Stripe price not configured");
    });
  });

  it("Logged-in + paid → network throw renders 'Network error' message", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ENETDOWN"));
    renderClient();
    fireEvent.click(screen.getByTestId("pricing-tier-starter-cta"));
    await waitFor(() => {
      expect(screen.getByTestId("pricing-tier-error").textContent).toContain(
        "Network error",
      );
    });
  });

  it("Logged-in + enterprise → mailto, no API call", () => {
    global.fetch = vi.fn();
    renderClient();
    fireEvent.click(screen.getByTestId("pricing-tier-enterprise-cta"));
    expect(window.location.href).toMatch(/^mailto:sales@/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("Clerk still loading → falls back to logged-out flow (router.push /sign-up)", () => {
    mockUseUser.mockReturnValue({ isLoaded: false, isSignedIn: false });
    renderClient();
    fireEvent.click(screen.getByTestId("pricing-tier-starter-cta"));
    expect(mockPush).toHaveBeenCalledWith("/sign-up?tier=starter");
  });

  it("Buttons disable while a tier-fetch is in flight (no concurrent upgrades)", async () => {
    let resolve: ((v: unknown) => void) | undefined;
    global.fetch = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderClient();
    fireEvent.click(screen.getByTestId("pricing-tier-starter-cta"));
    await waitFor(() => {
      expect(
        screen
          .getByTestId("pricing-tier-professional-cta")
          .hasAttribute("disabled"),
      ).toBe(true);
    });
    resolve?.({ ok: true, json: async () => ({ checkoutUrl: "https://x" }) });
  });
});
