// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SolutionSection } from "@/components/landing/solution-section";
import { FounderSection } from "@/components/landing/founder-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";
import { ProblemSection } from "@/components/landing/problem-section";
import { TerminalMockup } from "@/components/landing/terminal-mockup";

afterEach(() => {
  cleanup();
});

describe("Solution section — three steps with mockups", () => {
  it("renders three numbered step cards", () => {
    render(<SolutionSection />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("includes the result strip with revenue stream copy", () => {
    render(<SolutionSection />);
    expect(
      screen.getByText(/recurring revenue streams/i),
    ).toBeInTheDocument();
  });

  it("renders the per-step mockup labels", () => {
    render(<SolutionSection />);
    // Build mockup
    expect(screen.getByText("Trigger: New Lead")).toBeInTheDocument();
    expect(screen.getByText("Score Lead")).toBeInTheDocument();
    // Deploy mockup
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Beta Studios")).toBeInTheDocument();
    // Charge mockup
    expect(screen.getByText("Monthly recurring")).toBeInTheDocument();
  });
});

describe("Founder section — text-only with stats stripe + signoff", () => {
  it("renders the four founder stats", () => {
    render(<FounderSection />);
    expect(screen.getByText("Solo founder")).toBeInTheDocument();
    expect(screen.getByText("0 funding")).toBeInTheDocument();
    expect(screen.getByText("Built in public")).toBeInTheDocument();
    expect(screen.getByText("v1.0 shipped")).toBeInTheDocument();
  });

  it("uses no images (text-only voice)", () => {
    const { container } = render(<FounderSection />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("includes the cursive sign-off with location", () => {
    render(<FounderSection />);
    expect(screen.getByText("— André")).toBeInTheDocument();
    expect(screen.getByText(/osnabrück, germany/i)).toBeInTheDocument();
  });
});

describe("Pricing section — animated badge + highlight", () => {
  it("only the Agency tier renders the popular badge", () => {
    render(<PricingSection />);
    const badges = screen.getAllByTestId("pricing-badge-popular");
    expect(badges).toHaveLength(1);
    const grid = screen.getByTestId("pricing-grid");
    const agencyCard = grid.querySelector("[data-tier='agency']");
    expect(agencyCard?.contains(badges[0])).toBe(true);
  });

  it("Agency card carries the highlight + lift class", () => {
    render(<PricingSection />);
    const grid = screen.getByTestId("pricing-grid");
    const agencyCard = grid.querySelector("[data-tier='agency']");
    expect(agencyCard?.className).toMatch(/border-kiln-orange/);
    expect(agencyCard?.className).toMatch(/-translate-y-2/);
  });
});

describe("FAQ accordion", () => {
  it("starts closed and opens on click", () => {
    render(<FaqSection />);
    const first = screen.getByTestId("faq-item-0");
    expect(first.getAttribute("data-open")).toBe("false");
    fireEvent.click(first.querySelector("button")!);
    expect(first.getAttribute("data-open")).toBe("true");
  });

  it("links the founder mailto in the helper line", () => {
    render(<FaqSection />);
    const link = screen.getByRole("link", { name: /ask the founder/i });
    expect(link.getAttribute("href")).toMatch(
      /^mailto:andre@hephaistos-systems\.de/,
    );
  });
});

describe("FinalCta section — terminal mockup + CTAs", () => {
  it("primary CTA → /sign-up", () => {
    render(<FinalCtaSection />);
    const start = screen.getByRole("link", { name: /start free/i });
    expect(start).toHaveAttribute("href", "/sign-up");
  });

  it("secondary CTA mailto founder", () => {
    render(<FinalCtaSection />);
    const founder = screen.getByRole("link", { name: /talk to founder/i });
    expect(founder.getAttribute("href")).toMatch(
      /^mailto:andre@hephaistos-systems\.de/,
    );
  });
});

describe("Problem section — subtle polish", () => {
  it("renders three pain-point cards with hover-classes", () => {
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
});

describe("TerminalMockup", () => {
  it("renders with default agency-onboarding lines", () => {
    render(<TerminalMockup />);
    // The terminal renders with the prompt label visible
    expect(screen.getByText(/kiln — zsh/)).toBeInTheDocument();
  });

  it("respects custom lines override", () => {
    render(
      <TerminalMockup
        lines={[{ prompt: true, text: "echo hello", delay: 0 }]}
      />,
    );
    expect(screen.getByText(/kiln — zsh/)).toBeInTheDocument();
  });
});
