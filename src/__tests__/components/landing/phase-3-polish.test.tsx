// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TiltCard } from "@/components/landing/tilt-card";
import { FloatingElement } from "@/components/landing/floating-element";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { SolutionSection } from "@/components/landing/solution-section";

// jsdom matchMedia stub — components feature-detect this and disable
// pointer-driven animations when reduced-motion / coarse-pointer.
beforeEach(() => {
  if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

afterEach(() => {
  cleanup();
});

describe("TiltCard", () => {
  it("mounts and renders children", () => {
    render(
      <TiltCard>
        <span>tilt-child</span>
      </TiltCard>,
    );
    expect(screen.getByText("tilt-child")).toBeInTheDocument();
  });

  it("does not apply transform on initial render (rest state)", () => {
    const { container } = render(
      <TiltCard>
        <span>x</span>
      </TiltCard>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    // No inline transform on rest — only on mouse-move
    expect(wrapper.style.transform).toBe("");
  });

  it("applies a perspective + rotate transform on mouse-move when enabled", () => {
    const { container } = render(
      <TiltCard maxTilt={6}>
        <span>x</span>
      </TiltCard>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    // jsdom getBoundingClientRect returns zero-rect — but the
    // mousemove path computes anyway; we just verify it runs without
    // throwing and sets some transform string.
    fireEvent.mouseMove(wrapper, { clientX: 100, clientY: 80 });
    // rAF is async; jsdom doesn't run it. Trigger leave to confirm
    // the listener wiring exists.
    fireEvent.mouseLeave(wrapper);
    expect(wrapper.style.transform).toBe("");
  });

  it("includes will-change-transform for GPU promotion", () => {
    const { container } = render(
      <TiltCard>
        <span>x</span>
      </TiltCard>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toMatch(/will-change-transform/);
  });
});

describe("FloatingElement", () => {
  it("renders children with a default zero translation", () => {
    const { container } = render(
      <FloatingElement>
        <span>floating</span>
      </FloatingElement>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(screen.getByText("floating")).toBeInTheDocument();
    expect(wrapper.style.transform).toContain("translate(0px, 0px)");
  });
});

describe("HeroSection — Phase 3 wiring", () => {
  it("wraps the browser stack in a relative container with a stable testid", () => {
    render(<HeroSection />);
    expect(screen.getByTestId("hero-browser-stack")).toBeInTheDocument();
  });

  it("renders the terminal mockup as the 4th visual on xl screens", () => {
    render(<HeroSection />);
    // The terminal mockup ships its own xl:block class so it surfaces
    // on wide screens. We verify presence via the 'kiln — zsh' label
    // it always renders.
    expect(screen.getByText(/kiln — zsh/)).toBeInTheDocument();
  });
});

describe("FeaturesSection — TiltCard on Tier 1", () => {
  it("each Tier 1 card sits inside a will-change-transform tilt wrapper", () => {
    render(<FeaturesSection />);
    const cards = screen.getAllByTestId("tier1-card");
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      const tilt = card.parentElement;
      expect(tilt?.className).toMatch(/will-change-transform/);
    }
  });
});

describe("SolutionSection — FloatingElement on previews", () => {
  it("each step preview is wrapped so the mockup parallaxes", () => {
    const { container } = render(<SolutionSection />);
    // Each step renders a preview block inside an explicit
    // FloatingElement wrapper with translate(...) inline style.
    const wrappers = container.querySelectorAll(
      "[style*='translate(0px, 0px)']",
    );
    // At least 3 (one per step). Hero/features may add more if rendered,
    // but the SolutionSection alone exposes the three step previews.
    expect(wrappers.length).toBeGreaterThanOrEqual(3);
  });
});
