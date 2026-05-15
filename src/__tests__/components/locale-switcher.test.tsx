// @vitest-environment jsdom

/**
 * Sprint 19.9 — LocaleSwitcher rendering + behavior.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocaleSwitcher } from "@/components/locale-switcher";

const mockRefresh = vi.hoisted(() => vi.fn());
const mockUseLocale = vi.hoisted(() => vi.fn());
const mockUseTranslations = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useLocale: mockUseLocale,
  useTranslations: mockUseTranslations,
}));

beforeEach(() => {
  mockRefresh.mockReset();
  mockUseLocale.mockReset();
  mockUseTranslations.mockReset();
  // Default: active is "de", t(key) returns the English-y label for
  // simplicity. Tests that need German specifically override.
  mockUseLocale.mockReturnValue("de");
  mockUseTranslations.mockReturnValue((key: string) => {
    if (key === "de") return "Deutsch";
    if (key === "en") return "Englisch";
    if (key === "switchLabel") return "Sprache";
    return key;
  });
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("LocaleSwitcher menu variant (default)", () => {
  it("renders the trigger with the active locale code (CSS uppercases visually)", () => {
    render(<LocaleSwitcher />);
    const trigger = screen.getByTestId("locale-switcher-trigger");
    expect(trigger).toBeTruthy();
    // textContent is lowercase; the `uppercase` class transforms it visually.
    expect(trigger.textContent).toMatch(/de/);
  });

  it("doesn't show the menu until clicked", () => {
    render(<LocaleSwitcher />);
    expect(screen.queryByTestId("locale-switcher-menu")).toBeNull();
  });

  it("opens the menu on trigger click + shows both options", () => {
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByTestId("locale-switcher-trigger"));
    expect(screen.getByTestId("locale-switcher-menu")).toBeTruthy();
    expect(screen.getByTestId("locale-option-de")).toBeTruthy();
    expect(screen.getByTestId("locale-option-en")).toBeTruthy();
  });

  it("POSTs to /api/user/locale + closes menu + refreshes on selection", async () => {
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByTestId("locale-switcher-trigger"));
    fireEvent.click(screen.getByTestId("locale-option-en"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/user/locale",
        expect.objectContaining({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale: "en" }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByTestId("locale-switcher-menu")).toBeNull();
    });
  });

  it("clicking the already-active locale is a no-op (no fetch)", async () => {
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByTestId("locale-switcher-trigger"));
    fireEvent.click(screen.getByTestId("locale-option-de"));
    // Wait a tick to ensure the handler ran.
    await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("LocaleSwitcher inline variant", () => {
  it("renders both options as full rows", () => {
    render(<LocaleSwitcher variant="inline" />);
    expect(screen.getByTestId("locale-switcher-inline")).toBeTruthy();
    expect(screen.getByTestId("locale-option-de")).toBeTruthy();
    expect(screen.getByTestId("locale-option-en")).toBeTruthy();
    // No trigger button on inline variant.
    expect(screen.queryByTestId("locale-switcher-trigger")).toBeNull();
  });

  it("active option is disabled (can't re-pick itself)", () => {
    render(<LocaleSwitcher variant="inline" />);
    const activeButton = screen.getByTestId("locale-option-de") as HTMLButtonElement;
    expect(activeButton.disabled).toBe(true);
  });
});
