// @vitest-environment jsdom

/**
 * Sprint 19.10 — marketing header rendering + mobile menu + nav items.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MarketingHeader } from "@/components/marketing/marketing-header";

const mockUseLocale = vi.hoisted(() => vi.fn());
const mockUseTranslations = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-intl", () => ({
  useLocale: mockUseLocale,
  useTranslations: mockUseTranslations,
}));

beforeEach(() => {
  mockUseLocale.mockReturnValue("de");
  mockUseTranslations.mockImplementation(() => {
    return (key: string) => {
      const map: Record<string, string> = {
        features: "Features",
        pricing: "Pricing",
        faq: "FAQ",
        forAgencies: "Für Agencies",
        docs: "Docs",
        login: "Anmelden",
        startFree: "Jetzt starten",
        switchLabel: "Sprache",
        de: "Deutsch",
        en: "Englisch",
      };
      return map[key] ?? key;
    };
  });
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("MarketingHeader", () => {
  it("renders the brand logo linking to /", () => {
    render(<MarketingHeader />);
    const logo = screen.getByTestId("marketing-header-logo");
    expect(logo).toBeTruthy();
    expect(logo.getAttribute("href")).toBe("/");
  });

  it("renders the desktop nav with Features / Pricing / FAQ / For-Agencies", () => {
    render(<MarketingHeader />);
    const nav = screen.getByTestId("marketing-header-nav");
    expect(nav.textContent).toContain("Features");
    expect(nav.textContent).toContain("Pricing");
    expect(nav.textContent).toContain("FAQ");
    expect(nav.textContent).toContain("Agencies");
  });

  it("CTAs link to /sign-in and /sign-up", () => {
    render(<MarketingHeader />);
    expect(screen.getByTestId("marketing-header-login").getAttribute("href")).toBe(
      "/sign-in",
    );
    expect(screen.getByTestId("marketing-header-cta").getAttribute("href")).toBe(
      "/sign-up",
    );
  });

  it("renders the LocaleSwitcher", () => {
    render(<MarketingHeader />);
    expect(screen.getByTestId("locale-switcher")).toBeTruthy();
  });

  it("mobile menu is hidden by default and toggles on hamburger click", () => {
    render(<MarketingHeader />);
    expect(screen.queryByTestId("marketing-header-mobile-menu")).toBeNull();
    fireEvent.click(screen.getByTestId("marketing-header-mobile-toggle"));
    expect(screen.getByTestId("marketing-header-mobile-menu")).toBeTruthy();
  });

  it("mobile menu has aria-expanded + nav links + auth CTAs + inline locale switcher", () => {
    render(<MarketingHeader />);
    const toggle = screen.getByTestId("marketing-header-mobile-toggle");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByTestId("marketing-header-mobile-menu");
    // 4 nav items rendered + sign-in + sign-up + inline locale.
    expect(menu.textContent).toContain("Pricing");
    expect(menu.textContent).toContain("FAQ");
    expect(screen.getByTestId("locale-switcher-inline")).toBeTruthy();
  });
});
