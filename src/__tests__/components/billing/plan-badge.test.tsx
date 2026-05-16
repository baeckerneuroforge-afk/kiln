// @vitest-environment jsdom

/**
 * Sprint 20 — PlanBadge rendering across tiers + compact mode.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PlanBadge } from "@/components/billing/plan-badge";

const mockUseTranslations = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: mockUseTranslations,
}));

beforeEach(() => {
  mockUseTranslations.mockImplementation(() => {
    return (key: string) => {
      const map: Record<string, string> = {
        "freePlan.label": "Free Plan",
      };
      return map[key] ?? key;
    };
  });
  global.fetch = vi.fn();
});

describe("PlanBadge", () => {
  it("renders 'Free Plan' label and kiln-green tone when initialTier='free'", () => {
    render(<PlanBadge initialTier="free" />);
    const badge = screen.getByTestId("plan-badge");
    expect(badge.textContent).toContain("Free Plan");
    expect(badge.getAttribute("data-tier")).toBe("free");
    // Green tone class — kiln-green/30 border
    expect(badge.className).toContain("kiln-green");
  });

  it("renders the tier's displayName for paid tiers in kiln-orange", () => {
    render(<PlanBadge initialTier="professional" />);
    const badge = screen.getByTestId("plan-badge");
    expect(badge.textContent).toContain("Professional");
    expect(badge.className).toContain("kiln-orange");
  });

  it("compact mode renders the dot-only variant", () => {
    render(<PlanBadge initialTier="starter" compact />);
    const compact = screen.getByTestId("plan-badge-compact");
    expect(compact).toBeTruthy();
    expect(compact.getAttribute("aria-label")).toBe("Starter");
  });

  it("renders null while tier hasn't resolved (no initialTier, no fetch)", () => {
    // No initialTier means it'll try to fetch — mock fetch to never resolve.
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );
    const { container } = render(<PlanBadge />);
    expect(container.querySelector("[data-testid='plan-badge']")).toBeNull();
  });

  it("auto-fetches /api/billing/usage when initialTier is omitted", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tier: "starter" }),
    });
    render(<PlanBadge />);
    await waitFor(() => {
      expect(screen.getByTestId("plan-badge").textContent).toContain("Starter");
    });
    expect(global.fetch).toHaveBeenCalledWith("/api/billing/usage");
  });

  it("links to /dashboard/settings/billing by default", () => {
    render(<PlanBadge initialTier="free" />);
    expect(
      screen.getByTestId("plan-badge").getAttribute("href"),
    ).toBe("/dashboard/settings/billing");
  });
});
