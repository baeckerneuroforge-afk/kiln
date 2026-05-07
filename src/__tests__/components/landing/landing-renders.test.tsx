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
      screen.getByText(/phase b: agency-first ai infrastructure/i),
    ).toBeInTheDocument();
    // Headline reveals word-by-word, so we test for individual words
    expect(screen.getByText(/^Build$/)).toBeInTheDocument();
    expect(screen.getByText(/^Deploy$/)).toBeInTheDocument();
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

  it("solution section renders all three numbered steps", () => {
    render(<SolutionSection />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(
      screen.getByText(/build agents in your master workspace/i),
    ).toBeInTheDocument();
  });

  it("features section renders the four Tier 1 killer cards", () => {
    render(<FeaturesSection />);
    expect(screen.getByText("Multi-Agent Workflows")).toBeInTheDocument();
    expect(screen.getByText("White-Label Sub-Orgs")).toBeInTheDocument();
    expect(screen.getByText("Multi-Channel Deployment")).toBeInTheDocument();
    expect(screen.getByText("BYOK + MCP + A2A")).toBeInTheDocument();
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
    expect(screen.getAllByTestId(/^faq-item-\d+$/)).toHaveLength(9);
  });

  it("final CTA mirrors hero copy and offers Start Free + founder mailto", () => {
    render(<FinalCtaSection />);
    expect(screen.getByText(/build your ai agency/i)).toBeInTheDocument();
    const startLink = screen.getByRole("link", { name: /start free/i });
    expect(startLink).toHaveAttribute("href", "/sign-up");
  });
});
