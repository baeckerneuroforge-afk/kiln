// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FaqSection } from "@/components/landing/faq-section";

afterEach(() => {
  cleanup();
});

describe("FAQ accordion", () => {
  it("starts with all items closed", () => {
    render(<FaqSection />);
    const groups = screen.getAllByRole("group");
    expect(groups.length).toBe(9);
    for (const g of groups) {
      expect((g as HTMLDetailsElement).open).toBe(false);
    }
  });

  it("toggles a single item open via summary click", () => {
    render(<FaqSection />);
    const first = screen.getByTestId("faq-item-0") as HTMLDetailsElement;
    const summary = first.querySelector("summary")!;

    expect(first.open).toBe(false);
    fireEvent.click(summary);
    expect(first.open).toBe(true);
    fireEvent.click(summary);
    expect(first.open).toBe(false);
  });

  it("allows multiple items open at the same time", () => {
    render(<FaqSection />);
    const a = screen.getByTestId("faq-item-0") as HTMLDetailsElement;
    const b = screen.getByTestId("faq-item-3") as HTMLDetailsElement;

    fireEvent.click(a.querySelector("summary")!);
    fireEvent.click(b.querySelector("summary")!);

    expect(a.open).toBe(true);
    expect(b.open).toBe(true);
  });
});
