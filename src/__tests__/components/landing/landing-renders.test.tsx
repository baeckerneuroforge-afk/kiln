// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HeroSection } from "@/components/landing/hero-section";
import { ProblemSection } from "@/components/landing/problem-section";
import { SolutionSection } from "@/components/landing/solution-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { FounderSection } from "@/components/landing/founder-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";

afterEach(() => {
  cleanup();
});

describe("Landing sections render without crashing", () => {
  it("hero renders pre-headline, headline, and both CTAs", () => {
    render(<HeroSection />);
    expect(
      screen.getByText(/the agency-first ai platform/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/build ai agents once/i)).toBeInTheDocument();
    expect(screen.getByTestId("hero-cta-primary")).toHaveAttribute(
      "href",
      "/sign-up",
    );
    expect(screen.getByTestId("hero-cta-secondary")).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:andre@hephaistos-systems.de"),
    );
  });

  it("problem section renders three pain-point cards", () => {
    render(<ProblemSection />);
    expect(
      screen.getByText(/building from scratch every time/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no way to charge recurring/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/can't scale beyond 5 clients/i),
    ).toBeInTheDocument();
  });

  it("solution section renders all three steps", () => {
    render(<SolutionSection />);
    expect(screen.getByText(/step 01/i)).toBeInTheDocument();
    expect(screen.getByText(/step 02/i)).toBeInTheDocument();
    expect(screen.getByText(/step 03/i)).toBeInTheDocument();
    expect(screen.getByText(/build agents in kiln/i)).toBeInTheDocument();
  });

  it("features section renders six features and marks the agency USP", () => {
    render(<FeaturesSection />);
    expect(screen.getByText("Multi-Agent Workflows")).toBeInTheDocument();
    expect(screen.getByText("White-Label Sub-Orgs")).toBeInTheDocument();
    expect(screen.getByText("Multi-Channel Deployment")).toBeInTheDocument();
    expect(screen.getByText("Self-Learning Knowledge Base")).toBeInTheDocument();
    expect(screen.getByText("Bring Your Own Keys (BYOK)")).toBeInTheDocument();
    expect(screen.getByText("MCP + A2A Protocol")).toBeInTheDocument();
    expect(screen.getByText(/agency usp/i)).toBeInTheDocument();
  });

  it("founder section uses text-only voice (no images)", () => {
    const { container } = render(<FounderSection />);
    expect(screen.getByText(/hi, i'm andré/i)).toBeInTheDocument();
    // No <img> tags — pure founder voice
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByText(/email me directly/i)).toBeInTheDocument();
  });

  it("faq section renders all 9 questions", () => {
    render(<FaqSection />);
    expect(screen.getByText(/is my client data secure/i)).toBeInTheDocument();
    expect(screen.getAllByRole("group")).toHaveLength(9); // <details> = group
  });

  it("final CTA mirrors hero copy and offers Start Free + founder mailto", () => {
    render(<FinalCtaSection />);
    expect(
      screen.getByText(/ready to build your ai agency/i),
    ).toBeInTheDocument();
    const startLink = screen.getByRole("link", { name: /start free/i });
    expect(startLink).toHaveAttribute("href", "/sign-up");
  });
});
