// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";

afterEach(() => {
  cleanup();
});

describe("Landing buttons resolve to public, working hrefs", () => {
  it("nav Login → /sign-in (public route)", () => {
    render(<LandingNav />);
    const link = screen.getByRole("link", { name: /^login$/i });
    expect(link).toHaveAttribute("href", "/sign-in");
  });

  it("nav Start Free → /sign-up (public route)", () => {
    render(<LandingNav />);
    expect(screen.getByTestId("nav-cta-primary")).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });

  it("nav anchor links use leading slash so they work from sub-pages", () => {
    render(<LandingNav />);
    expect(
      screen.getByRole("link", { name: /^features$/i }),
    ).toHaveAttribute("href", "/#features");
    expect(
      screen.getByRole("link", { name: /^pricing$/i }),
    ).toHaveAttribute("href", "/#pricing");
  });

  it("nav surfaces /services link (Done-for-you offering reachable)", () => {
    render(<LandingNav />);
    expect(
      screen.getByRole("link", { name: /^services$/i }),
    ).toHaveAttribute("href", "/services");
  });

  it("hero primary CTA → /sign-up", () => {
    render(<HeroSection />);
    expect(screen.getByTestId("hero-cta-primary")).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });

  it("hero secondary CTA is a mailto with founder email", () => {
    render(<HeroSection />);
    const link = screen.getByTestId("hero-cta-secondary");
    expect(link.getAttribute("href")).toMatch(
      /^mailto:andre@hephaistos-systems\.de/,
    );
  });

  it("final CTA mirrors hero — Start Free + founder mailto", () => {
    render(<FinalCtaSection />);
    expect(screen.getByRole("link", { name: /start free/i })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    const founder = screen.getByRole("link", { name: /talk to founder/i });
    expect(founder.getAttribute("href")).toMatch(
      /^mailto:andre@hephaistos-systems\.de/,
    );
  });
});
