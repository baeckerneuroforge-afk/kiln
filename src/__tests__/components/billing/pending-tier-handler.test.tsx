// @vitest-environment jsdom

/**
 * Sprint 20.1.1 — PendingTierHandler fetch-and-redirect flow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PendingTierHandler } from "@/components/billing/pending-tier-handler";

const mockUseTranslations = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: mockUseTranslations,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslations.mockImplementation(() => {
    return (key: string, vars?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        redirectingTitle: "Redirecting…",
        redirectingSubtitle: `Setting up ${vars?.tier ?? ""}`,
        redirectError: "Could not start checkout — visit Settings → Billing",
      };
      return map[key] ?? key;
    };
  });

  global.fetch = vi.fn();

  Object.defineProperty(window, "location", {
    writable: true,
    value: { href: "" },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sprint 20.1.1 — PendingTierHandler", () => {
  it("renders null when initialTier is 'none' (no cookie path)", () => {
    const { container } = render(<PendingTierHandler initialTier="none" />);
    expect(container.querySelector("[data-testid='pending-tier-handler']")).toBeNull();
    // Must not hit the resolve endpoint.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches /api/billing/pending-tier on mount when initialTier is omitted", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: string) => {
        if (url === "/api/billing/pending-tier") {
          return { ok: true, json: async () => ({ pendingTier: null }) };
        }
        return { ok: true, json: async () => ({}) };
      },
    );
    render(<PendingTierHandler />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/billing/pending-tier");
    });
  });

  it("triggers /api/billing/upgrade with the resolved tier and redirects to checkoutUrl", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/billing/upgrade") {
        return {
          ok: true,
          json: async () => ({
            checkoutUrl: "https://checkout.stripe.com/abc",
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    global.fetch = fetchMock;

    render(<PendingTierHandler initialTier="starter" />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/billing/upgrade",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ targetTier: "starter" }),
        }),
      );
    });
    await waitFor(() => {
      expect(window.location.href).toBe("https://checkout.stripe.com/abc");
    });
  });

  it("renders the redirecting overlay while the fetch is in flight", async () => {
    let resolve: ((v: unknown) => void) | undefined;
    global.fetch = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<PendingTierHandler initialTier="agency_pro" />);
    await waitFor(() => {
      const overlay = screen.getByTestId("pending-tier-handler");
      expect(overlay.getAttribute("data-tier")).toBe("agency_pro");
      expect(overlay.getAttribute("data-status")).toBe("redirecting");
    });
    resolve?.({
      ok: true,
      json: async () => ({ checkoutUrl: "https://x" }),
    });
  });

  it("renders an error message when /api/billing/upgrade fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Stripe down" }),
    });
    render(<PendingTierHandler initialTier="professional" />);
    await waitFor(() => {
      expect(
        screen.getByTestId("pending-tier-handler-error").textContent,
      ).toContain("Could not start checkout");
    });
    // Must NOT redirect on failure.
    expect(window.location.href).toBe("");
  });
});
