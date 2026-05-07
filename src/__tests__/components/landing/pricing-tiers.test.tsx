// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PricingSection } from "@/components/landing/pricing-section";

afterEach(() => {
  cleanup();
});

describe("PricingSection", () => {
  it("renders all four tiers", () => {
    render(<PricingSection />);
    const grid = screen.getByTestId("pricing-grid");
    const cards = grid.querySelectorAll("[data-tier]");
    expect(cards).toHaveLength(4);
    expect(grid.querySelector("[data-tier='free']")).toBeTruthy();
    expect(grid.querySelector("[data-tier='pro']")).toBeTruthy();
    expect(grid.querySelector("[data-tier='business']")).toBeTruthy();
    expect(grid.querySelector("[data-tier='agency']")).toBeTruthy();
  });

  it("highlights only the Agency tier", () => {
    render(<PricingSection />);
    const grid = screen.getByTestId("pricing-grid");
    const highlighted = grid.querySelectorAll("[data-highlight='true']");
    expect(highlighted).toHaveLength(1);
    expect(
      (highlighted[0] as HTMLElement).getAttribute("data-tier"),
    ).toBe("agency");
    expect(
      screen.getByText(/most popular for agencies/i),
    ).toBeInTheDocument();
  });

  it("uses the new memory pricing (97 / 297 / 497)", () => {
    render(<PricingSection />);
    expect(screen.getByText("97€")).toBeInTheDocument();
    expect(screen.getByText("297€")).toBeInTheDocument();
    expect(screen.getByText("497€")).toBeInTheDocument();
  });

  it("each CTA points at the sign-up flow with the right plan param", () => {
    render(<PricingSection />);
    const free = screen.getByRole("link", { name: /start free/i });
    expect(free).toHaveAttribute("href", "/sign-up");

    const pro = screen.getByRole("link", { name: /start pro/i });
    expect(pro).toHaveAttribute("href", "/sign-up?plan=pro");

    const business = screen.getByRole("link", { name: /start business/i });
    expect(business).toHaveAttribute("href", "/sign-up?plan=business");

    const agency = screen.getByRole("link", { name: /start agency trial/i });
    expect(agency).toHaveAttribute("href", "/sign-up?plan=agency");
  });

  it("links to the services page for done-for-you offerings", () => {
    render(<PricingSection />);
    const link = screen.getByRole("link", { name: /talk to us/i });
    expect(link).toHaveAttribute("href", "/services");
  });
});
