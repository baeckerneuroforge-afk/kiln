// @vitest-environment jsdom

/**
 * Sprint 20 — FreePlanWelcomeBanner + TierLimitBanner rendering &
 * dismiss behaviour.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FreePlanWelcomeBanner } from "@/components/billing/free-plan-welcome-banner";
import { TierLimitBanner } from "@/components/billing/tier-limit-banner";

const mockUseTranslations = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: mockUseTranslations,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslations.mockImplementation(() => {
    // useTranslations("billing.freePlan") strips the namespace before
    // calling t, so the key here is the leaf (e.g. "welcomeBannerTitle").
    // useTranslations("billing") for the limit banner keeps the
    // path under "limits.X" / "notifications.approaching80.title".
    return (key: string, vars?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        // freePlan leaves
        label: "Free Plan",
        welcomeBannerTitle: "You're on the Free Plan",
        welcomeBannerSubtitle: "Forever free.",
        welcomeBannerCta: "See paid plans",
        welcomeBannerDismiss: "Got it",
        upgradeCta: "Upgrade",
        // billing namespace leaves
        "limits.monthlyConversations": "Conversations",
        "limits.maxAgents": "Agents",
        "freePlan.upgradeCta": "Upgrade",
        "notifications.approaching80.title": `Approaching ${vars?.resource}`,
        "notifications.approaching80.body": `${vars?.current}/${vars?.limit} ${vars?.resource}`,
        "notifications.approaching95.title": `Almost at ${vars?.resource} limit`,
        "notifications.approaching95.body": `${vars?.current}/${vars?.limit} ${vars?.resource}`,
        "notifications.reached100.title": `${vars?.resource} limit reached`,
        "notifications.reached100.body": `${vars?.current}/${vars?.limit} ${vars?.resource} on ${vars?.tier}`,
      };
      return map[key] ?? key;
    };
  });

  global.fetch = vi.fn();
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
});

describe("FreePlanWelcomeBanner", () => {
  it("renders for free tier when not dismissed", () => {
    render(<FreePlanWelcomeBanner initialTier="free" />);
    expect(screen.getByTestId("free-plan-welcome-banner")).toBeTruthy();
    expect(screen.getByTestId("free-plan-welcome-banner").textContent).toContain(
      "You're on the Free Plan",
    );
  });

  it("renders null on paid tiers", () => {
    const { container } = render(<FreePlanWelcomeBanner initialTier="starter" />);
    expect(container.querySelector("[data-testid='free-plan-welcome-banner']")).toBeNull();
  });

  it("dismiss button writes to localStorage and removes the banner", () => {
    render(<FreePlanWelcomeBanner initialTier="free" />);
    const dismissBtn = screen.getByLabelText("Got it");
    fireEvent.click(dismissBtn);
    expect(
      screen.queryByTestId("free-plan-welcome-banner"),
    ).toBeNull();
    expect(window.localStorage.getItem("kiln_free_welcome_dismissed_v1")).toBe("1");
  });

  it("respects existing localStorage dismissal on mount", async () => {
    window.localStorage.setItem("kiln_free_welcome_dismissed_v1", "1");
    render(<FreePlanWelcomeBanner initialTier="free" />);
    await waitFor(() => {
      expect(
        screen.queryByTestId("free-plan-welcome-banner"),
      ).toBeNull();
    });
  });
});

describe("TierLimitBanner", () => {
  function mockUsage(usage: Partial<{
    tier: string;
    percentages: Partial<Record<string, number>>;
    usage: Partial<Record<string, number>>;
    limits: Partial<Record<string, number>>;
    nextTier: string | null;
  }>) {
    const data = {
      tier: "free",
      nextTier: "starter",
      percentages: { conversations: 0, agents: 0, subOrgs: 0, oauth: 0, ...usage.percentages },
      usage: {
        conversationsCount: 0,
        agentsCount: 0,
        subOrgsCount: 0,
        oauthConnectionsCount: 0,
        ...usage.usage,
      },
      limits: {
        monthlyConversations: 100,
        maxAgents: 3,
        maxSubOrgs: 1,
        maxOAuthConnections: 1,
        ...usage.limits,
      },
    };
    return data;
  }

  it("renders null when every counter is under 80%", () => {
    const { container } = render(
      <TierLimitBanner initialData={mockUsage({ percentages: { conversations: 50 } }) as never} />,
    );
    expect(container.querySelector("[data-testid='tier-limit-banner']")).toBeNull();
  });

  it("renders the amber 80–94% banner", () => {
    render(
      <TierLimitBanner
        initialData={
          mockUsage({
            percentages: { conversations: 85 },
            usage: { conversationsCount: 85 },
          }) as never
        }
      />,
    );
    const banner = screen.getByTestId("tier-limit-banner");
    expect(banner.getAttribute("data-percentage")).toBe("85");
    expect(banner.getAttribute("data-resource")).toBe("monthlyConversations");
    expect(banner.textContent).toContain("Approaching");
  });

  it("renders the critical 100% banner with alert role", () => {
    render(
      <TierLimitBanner
        initialData={
          mockUsage({
            percentages: { conversations: 100 },
            usage: { conversationsCount: 100 },
          }) as never
        }
      />,
    );
    const banner = screen.getByTestId("tier-limit-banner");
    expect(banner.getAttribute("data-percentage")).toBe("100");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain("limit reached");
  });

  it("picks the highest-percentage resource when multiple are over threshold", () => {
    render(
      <TierLimitBanner
        initialData={
          mockUsage({
            percentages: { conversations: 82, agents: 100 },
            usage: { conversationsCount: 82, agentsCount: 3 },
          }) as never
        }
      />,
    );
    const banner = screen.getByTestId("tier-limit-banner");
    expect(banner.getAttribute("data-resource")).toBe("maxAgents");
    expect(banner.getAttribute("data-percentage")).toBe("100");
  });

  it("dismissing hides the banner", () => {
    render(
      <TierLimitBanner
        initialData={
          mockUsage({
            percentages: { conversations: 95 },
            usage: { conversationsCount: 95 },
          }) as never
        }
      />,
    );
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByTestId("tier-limit-banner")).toBeNull();
  });
});
