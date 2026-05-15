// @vitest-environment jsdom

/**
 * Sprint 19.10 — FaqClient accordion behavior + category rendering.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FaqClient } from "@/components/marketing/faq-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const CATEGORIES = [
  {
    title: "Allgemein",
    items: [
      { id: "what", q: "Was ist KILN?", a: "Multi-Tenant AI-Plattform." },
      { id: "for-whom", q: "Für wen?", a: "Agencies." },
    ],
  },
  {
    title: "Pricing",
    items: [
      { id: "payment", q: "Welche Zahlungsmethoden?", a: "Stripe + SEPA." },
    ],
  },
];

const COMMON_PROPS = {
  heroTitle: "FAQ",
  heroSubtitle: "Antworten",
  categories: CATEGORIES,
  contactCtaTitle: "Frage nicht beantwortet?",
  contactCtaBody: "Schreib uns",
  contactCtaButton: "Sales kontaktieren",
};

describe("FaqClient", () => {
  it("renders hero + categories + contact CTA", () => {
    render(<FaqClient {...COMMON_PROPS} />);
    expect(screen.getByTestId("faq-page")).toBeTruthy();
    expect(screen.getByText("FAQ")).toBeTruthy();
    expect(screen.getByTestId("faq-categories")).toBeTruthy();
    expect(screen.getByTestId("faq-contact-cta")).toBeTruthy();
  });

  it("renders 2 categories with the right items", () => {
    render(<FaqClient {...COMMON_PROPS} />);
    expect(screen.getByTestId("faq-category-allgemein")).toBeTruthy();
    expect(screen.getByTestId("faq-category-pricing")).toBeTruthy();
    expect(screen.getByTestId("faq-item-what")).toBeTruthy();
    expect(screen.getByTestId("faq-item-for-whom")).toBeTruthy();
    expect(screen.getByTestId("faq-item-payment")).toBeTruthy();
  });

  it("answers are hidden by default; clicking the toggle expands one", () => {
    render(<FaqClient {...COMMON_PROPS} />);
    expect(screen.queryByTestId("faq-item-what-answer")).toBeNull();
    fireEvent.click(screen.getByTestId("faq-item-what-toggle"));
    expect(screen.getByTestId("faq-item-what-answer").textContent).toContain(
      "Multi-Tenant",
    );
  });

  it("only one item open at a time within a category (accordion)", () => {
    render(<FaqClient {...COMMON_PROPS} />);
    fireEvent.click(screen.getByTestId("faq-item-what-toggle"));
    expect(screen.getByTestId("faq-item-what-answer")).toBeTruthy();
    fireEvent.click(screen.getByTestId("faq-item-for-whom-toggle"));
    expect(screen.queryByTestId("faq-item-what-answer")).toBeNull();
    expect(screen.getByTestId("faq-item-for-whom-answer")).toBeTruthy();
  });

  it("aria-expanded reflects open state", () => {
    render(<FaqClient {...COMMON_PROPS} />);
    const toggle = screen.getByTestId("faq-item-what-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("contact CTA links to mailto sales@kilnbase.com", () => {
    render(<FaqClient {...COMMON_PROPS} />);
    expect(
      screen.getByTestId("faq-contact-cta-button").getAttribute("href"),
    ).toMatch(/^mailto:sales@kilnbase\.com/);
  });
});
