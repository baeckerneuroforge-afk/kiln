// @vitest-environment jsdom

/**
 * Sprint 20 — UpgradeModal renders + POSTs the upgrade + handles checkout
 * redirects vs in-place tier changes.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UpgradeModal } from "@/components/billing/upgrade-modal";

const mockRouterRefresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh, push: vi.fn() }),
}));

const mockUseTranslations = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: mockUseTranslations,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslations.mockImplementation(() => {
    return (key: string, vars?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "limits.monthlyConversations": "Conversations",
        "limits.customDomain": "Custom domain",
        "upgradeModal.title": `You've reached your ${vars?.resource ?? ""} limit`,
        "upgradeModal.description": `${vars?.current}/${vars?.limit} on ${vars?.tier}, upgrade to ${vars?.nextTier}`,
        "upgradeModal.premiumTitle": `${vars?.resource ?? ""} is a premium feature`,
        "upgradeModal.premiumDescription": `${vars?.resource} → upgrade to ${vars?.nextTier}`,
        "upgradeModal.ctaUpgrade": `Upgrade to ${vars?.nextTier ?? ""}`,
        "upgradeModal.ctaCancel": "Maybe later",
        "upgradeModal.ctaSeeAllPlans": "Compare all plans",
      };
      return map[key] ?? key;
    };
  });
  global.fetch = vi.fn();
  // Mock window.location.href setter so we can detect redirects.
  Object.defineProperty(window, "location", {
    value: { href: "" },
    writable: true,
  });
});

describe("UpgradeModal", () => {
  it("does not render when open=false", () => {
    render(
      <UpgradeModal
        open={false}
        onOpenChange={() => {}}
        variant="quota"
        resource="monthlyConversations"
        currentTier="free"
        nextTier="starter"
        current={100}
        limit={100}
      />,
    );
    expect(screen.queryByTestId("upgrade-modal")).toBeNull();
  });

  it("renders quota copy with current/limit/tier/nextTier", () => {
    render(
      <UpgradeModal
        open
        onOpenChange={() => {}}
        variant="quota"
        resource="monthlyConversations"
        currentTier="free"
        nextTier="starter"
        current={100}
        limit={100}
      />,
    );
    const modal = screen.getByTestId("upgrade-modal");
    expect(modal.getAttribute("data-variant")).toBe("quota");
    expect(modal.getAttribute("data-resource")).toBe("monthlyConversations");
    expect(modal.textContent).toContain("Conversations");
    expect(modal.textContent).toContain("100/100");
    expect(modal.textContent).toContain("Upgrade to Starter");
  });

  it("renders premium copy for boolean-feature gates", () => {
    render(
      <UpgradeModal
        open
        onOpenChange={() => {}}
        variant="premium"
        resource="customDomain"
        currentTier="free"
        nextTier="starter"
      />,
    );
    const modal = screen.getByTestId("upgrade-modal");
    expect(modal.getAttribute("data-variant")).toBe("premium");
    expect(modal.textContent).toContain("Custom domain is a premium feature");
  });

  it("redirects to Stripe checkoutUrl when the upgrade endpoint returns one", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ checkoutUrl: "https://checkout.stripe.com/abc" }),
    });
    render(
      <UpgradeModal
        open
        onOpenChange={() => {}}
        variant="quota"
        resource="monthlyConversations"
        currentTier="free"
        nextTier="starter"
        current={100}
        limit={100}
      />,
    );
    fireEvent.click(screen.getByTestId("upgrade-modal-cta-upgrade"));
    await waitFor(() => {
      expect(window.location.href).toBe("https://checkout.stripe.com/abc");
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/billing/upgrade",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetTier: "starter" }),
      }),
    );
  });

  it("calls router.refresh + closes when in-place tier change succeeds", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, tier: "professional" }),
    });
    const onOpenChange = vi.fn();
    render(
      <UpgradeModal
        open
        onOpenChange={onOpenChange}
        variant="quota"
        resource="maxAgents"
        currentTier="starter"
        nextTier="professional"
        current={10}
        limit={10}
      />,
    );
    fireEvent.click(screen.getByTestId("upgrade-modal-cta-upgrade"));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it("renders inline error message when the upgrade fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Stripe price not configured" }),
    });
    render(
      <UpgradeModal
        open
        onOpenChange={() => {}}
        variant="quota"
        resource="monthlyConversations"
        currentTier="free"
        nextTier="starter"
        current={100}
        limit={100}
      />,
    );
    fireEvent.click(screen.getByTestId("upgrade-modal-cta-upgrade"));
    await waitFor(() => {
      expect(screen.getByTestId("upgrade-modal-error").textContent).toContain(
        "Stripe price not configured",
      );
    });
  });
});
