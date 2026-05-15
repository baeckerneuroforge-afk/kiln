// @vitest-environment jsdom

/**
 * Sprint 19.9.1 — LocaleSwitcher `iconOnly` mode for collapsed sidebar.
 *
 * Verifies the trigger shrinks to the icon when iconOnly is set,
 * hides the locale-code label and chevron, but stays clickable and
 * opens the same menu.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LocaleSwitcher } from "@/components/locale-switcher";

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
  mockUseTranslations.mockReturnValue((key: string) => {
    const labels: Record<string, string> = {
      de: "Deutsch",
      en: "Englisch",
      switchLabel: "Sprache",
    };
    return labels[key] ?? key;
  });
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("LocaleSwitcher iconOnly variant", () => {
  it("hides the locale-code label when iconOnly is true", () => {
    render(<LocaleSwitcher iconOnly />);
    const trigger = screen.getByTestId("locale-switcher-trigger");
    // The "de" text isn't visible — only the Languages icon survives.
    expect(trigger.textContent).not.toMatch(/de/i);
  });

  it("still renders the locale-code in default (non-iconOnly) mode", () => {
    render(<LocaleSwitcher />);
    const trigger = screen.getByTestId("locale-switcher-trigger");
    expect(trigger.textContent).toMatch(/de/);
  });

  it("opens the menu when iconOnly trigger is clicked", () => {
    render(<LocaleSwitcher iconOnly />);
    fireEvent.click(screen.getByTestId("locale-switcher-trigger"));
    expect(screen.getByTestId("locale-switcher-menu")).toBeTruthy();
    // Both options still rendered inside the menu.
    expect(screen.getByTestId("locale-option-de")).toBeTruthy();
    expect(screen.getByTestId("locale-option-en")).toBeTruthy();
  });

  it("aria-label is still present so screen readers announce the control", () => {
    render(<LocaleSwitcher iconOnly />);
    const trigger = screen.getByTestId("locale-switcher-trigger");
    expect(trigger.getAttribute("aria-label")).toBe("Sprache");
  });
});
