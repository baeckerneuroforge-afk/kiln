// @vitest-environment jsdom

/**
 * Sprint 20.1.1 — UpgradeResultToast reads ?upgrade=success/cancelled
 * from useSearchParams, fires a toast, and clears the URL params.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { UpgradeResultToast } from "@/components/billing/upgrade-result-toast";

const mockToast = vi.hoisted(() => vi.fn());
const mockReplace = vi.hoisted(() => vi.fn());
const mockSearchParams = vi.hoisted(() => new URLSearchParams());
const mockUseTranslations = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/components/toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("next-intl", () => ({
  useTranslations: mockUseTranslations,
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the params between tests.
  Array.from(mockSearchParams.keys()).forEach((k) => mockSearchParams.delete(k));
  mockUseTranslations.mockImplementation(() => {
    return (key: string, vars?: Record<string, string | number>) => {
      if (key === "success") return `Upgrade complete! Welcome to ${vars?.tier ?? ""}.`;
      if (key === "cancelled") return "Upgrade cancelled. Try again anytime.";
      return key;
    };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sprint 20.1.1 — UpgradeResultToast", () => {
  it("renders null and is a no-op when no upgrade param is present", () => {
    const { container } = render(<UpgradeResultToast />);
    expect(container.firstChild).toBeNull();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("fires a success toast and clears the params when ?upgrade=success&tier=starter", () => {
    mockSearchParams.set("upgrade", "success");
    mockSearchParams.set("tier", "starter");
    render(<UpgradeResultToast />);
    expect(mockToast).toHaveBeenCalledWith(
      "Upgrade complete! Welcome to Starter.",
      "success",
    );
    // Params are cleared by router.replace pointing back at /dashboard
    // without ?upgrade=... or ?tier=...
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
  });

  it("fires an info toast on ?upgrade=cancelled", () => {
    mockSearchParams.set("upgrade", "cancelled");
    render(<UpgradeResultToast />);
    expect(mockToast).toHaveBeenCalledWith(
      "Upgrade cancelled. Try again anytime.",
      "info",
    );
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
  });

  it("ignores garbage upgrade values (renders null)", () => {
    mockSearchParams.set("upgrade", "garbage");
    const { container } = render(<UpgradeResultToast />);
    expect(container.firstChild).toBeNull();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("falls back to empty tier name when ?tier is missing on success", () => {
    mockSearchParams.set("upgrade", "success");
    render(<UpgradeResultToast />);
    // The success message still fires — tier interpolates as "" via
    // getTierLimits fallback (which returns Free for unknown tier).
    expect(mockToast).toHaveBeenCalled();
    const [message] = mockToast.mock.calls[0];
    expect(message).toContain("Upgrade complete!");
  });
});
