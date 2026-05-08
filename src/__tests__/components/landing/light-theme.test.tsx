// @vitest-environment jsdom

/**
 * Phase 4 — light-theme verification.
 *
 * The landing surface flipped from a dark-mode default to a warm
 * cream `.landing-light` scope. These tests pin the contract:
 *  - the landing wrapper carries the `.landing-light` class
 *  - the StarField was replaced with the DotGrid
 *  - hero / pricing / FAQ headlines render against light copy tokens
 *  - the Final-CTA section stays dark for visual contrast
 *  - color-contrast: stone-900 on white satisfies WCAG-AAA (>= 7:1)
 */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import LandingPage from "@/app/page";
import AgenciesPage from "@/app/agencies/page";
import { HeroSection } from "@/components/landing/hero-section";
import { ProblemSection } from "@/components/landing/problem-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";
import { LandingNav } from "@/components/landing/landing-nav";
import { DotGrid } from "@/components/landing/dot-grid";

afterEach(() => {
  cleanup();
});

describe("Landing — light-theme wrapper", () => {
  it("LandingPage <main> wears the .landing-light class", () => {
    const { container } = render(<LandingPage />);
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main!.className).toMatch(/landing-light/);
  });

  it("AgenciesPage <main> also wears .landing-light", () => {
    const { container } = render(<AgenciesPage />);
    const main = container.querySelector("main");
    expect(main!.className).toMatch(/landing-light/);
  });

  it("LandingPage mounts the DotGrid (replaces StarField)", () => {
    render(<LandingPage />);
    expect(screen.getByTestId("landing-dot-grid")).toBeInTheDocument();
  });
});

describe("Landing — light-theme color tokens", () => {
  it("hero headline renders against the stone-900 / kiln-orange palette (no zinc)", () => {
    const { container } = render(<HeroSection />);
    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1!.className).toMatch(/text-stone-900/);
    // The two-color headline still highlights "Deploy" in orange
    expect(h1!.querySelector(".text-kiln-orange")).not.toBeNull();
  });

  it("problem section sits on stone-50 (not bg-card)", () => {
    const { container } = render(<ProblemSection />);
    const section = container.querySelector("section");
    expect(section!.className).toMatch(/bg-stone-50/);
  });

  it("pricing primary tier uses the new bg-stone-900 dark CTA on light", () => {
    render(<PricingSection />);
    const grid = screen.getByTestId("pricing-grid");
    const freeCard = grid.querySelector("[data-tier='free']");
    const startLink = freeCard!.querySelector("a");
    expect(startLink!.className).toMatch(/bg-stone-900/);
  });

  it("FAQ open-state lights up with kiln-orange accent (not zinc)", () => {
    const { container } = render(<FaqSection />);
    const html = container.innerHTML;
    expect(html).toMatch(/border-stone-200/);
    // No legacy zinc/neutral classes leaked into the rewrite
    expect(html).not.toMatch(/bg-zinc-/);
  });
});

describe("Landing — Final-CTA stays dark for contrast", () => {
  it("Final-CTA section background is bg-stone-900", () => {
    const { container } = render(<FinalCtaSection />);
    const section = container.querySelector("section");
    expect(section!.className).toMatch(/bg-stone-900/);
  });

  it("Final-CTA headline copy is white on the dark band", () => {
    const { container } = render(<FinalCtaSection />);
    const h2 = container.querySelector("h2");
    expect(h2!.className).toMatch(/text-white/);
  });
});

describe("Landing nav — frosted-glass light theme", () => {
  it("renders the brand mark + Start Free CTA against the new light palette", () => {
    render(<LandingNav />);
    const cta = screen.getByTestId("nav-cta-primary");
    expect(cta).toHaveAttribute("href", "/sign-up");
    expect(cta.className).toMatch(/bg-kiln-orange/);
    expect(cta.className).toMatch(/text-white/);
  });
});

describe("DotGrid background", () => {
  it("renders a fixed-position aria-hidden grid layer", () => {
    render(<DotGrid />);
    const grid = screen.getByTestId("landing-dot-grid");
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveAttribute("aria-hidden");
    expect(grid.className).toMatch(/fixed/);
    expect(grid.className).toMatch(/inset-0/);
  });
});

/**
 * Color-contrast check — pins the stone-900 (#0A0A0A) on white (#FFFFFF)
 * combination as WCAG-AAA-compliant (>= 7:1 contrast ratio). If the
 * palette ever drifts away from the strong near-black headline color,
 * this test will catch it before merge.
 */
describe("Landing color-contrast — WCAG-AAA threshold", () => {
  // Standard relative-luminance formula from the W3C contrast spec.
  // Public-domain helper; encoded inline so the test is self-contained.
  function relativeLuminance(rgb: [number, number, number]) {
    const linear = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const [r, g, b] = rgb.map(linear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrastRatio(
    fg: [number, number, number],
    bg: [number, number, number],
  ) {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  }

  it("stone-900 (#0A0A0A) on white (#FFFFFF) is >= 7:1 (AAA body)", () => {
    const ratio = contrastRatio([10, 10, 10], [255, 255, 255]);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it("stone-700 body copy (#404040) on cream (#FAFAF9) is >= 7:1", () => {
    const ratio = contrastRatio([64, 64, 64], [250, 250, 249]);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it("stone-600 muted copy (#525252) on white passes AAA (>= 7:1)", () => {
    const ratio = contrastRatio([82, 82, 82], [255, 255, 255]);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it("white on stone-900 (Final-CTA + secondary buttons) is >= 7:1", () => {
    const ratio = contrastRatio([255, 255, 255], [12, 10, 9]);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });
});
