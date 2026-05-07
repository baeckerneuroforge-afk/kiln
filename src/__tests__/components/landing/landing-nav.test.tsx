// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LandingNav } from "@/components/landing/landing-nav";

afterEach(() => {
  cleanup();
});

describe("LandingNav", () => {
  it("renders the agency-focused four-item nav (no Computer Use / Marketplace / Developers in top nav)", () => {
    render(<LandingNav />);
    expect(screen.getByRole("link", { name: /^features$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^pricing$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /for agencies/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^docs$/i })).toBeInTheDocument();

    expect(
      screen.queryByRole("link", { name: /^computer use$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^marketplace$/i }),
    ).not.toBeInTheDocument();
  });

  it("primary CTA points to /sign-up", () => {
    render(<LandingNav />);
    expect(screen.getByTestId("nav-cta-primary")).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });
});
