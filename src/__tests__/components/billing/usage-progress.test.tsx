// @vitest-environment jsdom

/**
 * Sprint 20 — UsageProgress bar rendering + tone thresholds.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsageProgress } from "@/components/billing/usage-progress";
import { UNLIMITED } from "@/lib/billing/tier-limits";

const mockUseTranslations = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: mockUseTranslations,
}));

beforeEach(() => {
  mockUseTranslations.mockImplementation(() => {
    return (key: string, vars?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "limits.monthlyConversations": "Conversations",
        "limits.maxAgents": "Agents",
        "limits.maxStorageBytes": "Storage",
        "usageProgress.notTracked": "Coming soon",
        "usageProgress.unlimited": "Unlimited",
      };
      if (map[key]) return map[key];
      if (key === "usageProgress.ofLimit") {
        return `${vars?.current ?? 0} of ${vars?.limit ?? 0}`;
      }
      return key;
    };
  });
});

describe("UsageProgress", () => {
  it("renders label + current/limit + percentage on the bar", () => {
    render(
      <UsageProgress resource="monthlyConversations" current={42} limit={100} />,
    );
    const root = screen.getByTestId("usage-monthlyConversations");
    expect(root.textContent).toContain("Conversations");
    expect(root.textContent).toContain("42 of 100");
    expect(root.getAttribute("data-percentage")).toBe("42");
  });

  it("kiln-orange tone below 80%", () => {
    render(
      <UsageProgress resource="maxAgents" current={1} limit={3} />,
    );
    const bar = screen
      .getByTestId("usage-maxAgents")
      .querySelector("div[class*='kiln-orange']");
    expect(bar).toBeTruthy();
  });

  it("amber tone in the 80–94% band", () => {
    render(
      <UsageProgress resource="monthlyConversations" current={85} limit={100} />,
    );
    const root = screen.getByTestId("usage-monthlyConversations");
    expect(root.getAttribute("data-percentage")).toBe("85");
    expect(root.querySelector("div[class*='amber']")).toBeTruthy();
  });

  it("kiln-ember tone ≥ 95%", () => {
    render(
      <UsageProgress resource="monthlyConversations" current={98} limit={100} />,
    );
    const root = screen.getByTestId("usage-monthlyConversations");
    expect(root.querySelector("div[class*='kiln-ember']")).toBeTruthy();
  });

  it("renders 'Unlimited' for enterprise-style limits", () => {
    render(
      <UsageProgress
        resource="maxAgents"
        current={1000}
        limit={UNLIMITED}
      />,
    );
    expect(screen.getByTestId("usage-maxAgents").textContent).toContain(
      "Unlimited",
    );
  });

  it("renders 'Coming soon' when notTracked", () => {
    render(
      <UsageProgress
        resource="maxStorageBytes"
        current={0}
        limit={1024}
        notTracked
      />,
    );
    expect(
      screen.getByTestId("usage-maxStorageBytes").textContent,
    ).toContain("Coming soon");
  });

  it("caps the bar width at 100% when current exceeds limit", () => {
    render(
      <UsageProgress
        resource="monthlyConversations"
        current={150}
        limit={100}
      />,
    );
    expect(
      screen.getByTestId("usage-monthlyConversations").getAttribute("data-percentage"),
    ).toBe("100");
  });
});
