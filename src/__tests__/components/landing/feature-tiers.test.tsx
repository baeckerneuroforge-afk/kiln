// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FeaturesSection } from "@/components/landing/features-section";

afterEach(() => {
  cleanup();
});

describe("FeaturesSection — 18 features in 3 tiers", () => {
  it("renders all four Tier 1 killer USP cards with drill-down links", () => {
    render(<FeaturesSection />);
    const tier1Titles = [
      "Multi-Agent Workflows",
      "White-Label Sub-Orgs",
      "Multi-Channel Deployment",
      "BYOK + MCP + A2A",
    ];
    for (const t of tier1Titles) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    // Each Tier 1 card is a Link to /features/[slug]
    const links = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((href): href is string => Boolean(href?.startsWith("/features/")));
    expect(links).toEqual(
      expect.arrayContaining([
        "/features/multi-agent-workflows",
        "/features/white-label-sub-orgs",
        "/features/multi-channel",
        "/features/byok-mcp-a2a",
      ]),
    );
  });

  it("renders all 8 Tier 2 power feature cards", () => {
    render(<FeaturesSection />);
    const tier2Titles = [
      "Self-Learning Knowledge Base",
      "Agent Teams (Hierarchical)",
      "Agent Memory (Persistent)",
      "Stripe-Connect Billing",
      "Custom Domains per Sub-Org",
      "Lead Scoring & Actions",
      "Approval Workflows",
      "Audit Trail (GDPR)",
    ];
    for (const t of tier2Titles) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("renders all 6 Tier 3 trust-anchor cards", () => {
    render(<FeaturesSection />);
    const tier3Titles = [
      "EU-hosted + GDPR-native",
      "RBAC: 5 Roles built-in",
      "SLA Monitoring + Uptime",
      "Real-time Cost Controls",
      "Webhooks + REST API",
      "Version Control for Agents",
    ];
    for (const t of tier3Titles) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("section headings group the three tiers", () => {
    render(<FeaturesSection />);
    expect(
      screen.getByText(/built for serious agencies/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/production-ready infrastructure/i),
    ).toBeInTheDocument();
  });
});
