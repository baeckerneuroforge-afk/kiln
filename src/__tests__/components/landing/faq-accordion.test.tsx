// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FaqSection } from "@/components/landing/faq-section";

afterEach(() => {
  cleanup();
});

describe("FAQ accordion (React-controlled, CSS-grid height)", () => {
  it("starts with all items closed", () => {
    render(<FaqSection />);
    const items = screen.getAllByTestId(/^faq-item-\d+$/);
    expect(items).toHaveLength(9);
    for (const item of items) {
      expect(item.getAttribute("data-open")).toBe("false");
    }
  });

  it("toggles a single item open on summary click", () => {
    render(<FaqSection />);
    const first = screen.getByTestId("faq-item-0");
    const button = first.querySelector("button")!;

    expect(first.getAttribute("data-open")).toBe("false");
    fireEvent.click(button);
    expect(first.getAttribute("data-open")).toBe("true");
    fireEvent.click(button);
    expect(first.getAttribute("data-open")).toBe("false");
  });

  it("allows multiple items open at the same time", () => {
    render(<FaqSection />);
    const a = screen.getByTestId("faq-item-0");
    const b = screen.getByTestId("faq-item-3");

    fireEvent.click(a.querySelector("button")!);
    fireEvent.click(b.querySelector("button")!);

    expect(a.getAttribute("data-open")).toBe("true");
    expect(b.getAttribute("data-open")).toBe("true");
  });

  it("applies the CSS-grid panel class for height animation", () => {
    render(<FaqSection />);
    const first = screen.getByTestId("faq-item-0");
    const grid = first.querySelector(".kiln-faq-grid");
    expect(grid).toBeTruthy();
    expect(grid?.getAttribute("data-open")).toBe("false");
    fireEvent.click(first.querySelector("button")!);
    expect(grid?.getAttribute("data-open")).toBe("true");
  });

  it("uses aria-expanded so the toggle is reachable to screen readers", () => {
    render(<FaqSection />);
    const button = screen.getAllByRole("button", { expanded: false })[0];
    expect(button).toBeTruthy();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });
});
