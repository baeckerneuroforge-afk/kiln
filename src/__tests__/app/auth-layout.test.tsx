// @vitest-environment jsdom

/**
 * Sprint 19.9.1 — auth route-group layout renders LocaleSwitcher
 * top-right so first-time visitors can change language before login.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import AuthLayout from "@/app/(auth)/layout";

const mockUseLocale = vi.hoisted(() => vi.fn());
const mockUseTranslations = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-intl", () => ({
  useLocale: mockUseLocale,
  useTranslations: mockUseTranslations,
}));

beforeEach(() => {
  mockUseLocale.mockReturnValue("de");
  mockUseTranslations.mockReturnValue((key: string) => key);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("AuthLayout", () => {
  it("renders the LocaleSwitcher top-right", () => {
    render(
      <AuthLayout>
        <div data-testid="auth-page-child">child page</div>
      </AuthLayout>,
    );
    expect(screen.getByTestId("auth-locale-switcher")).toBeTruthy();
    expect(screen.getByTestId("locale-switcher")).toBeTruthy();
    expect(screen.getByTestId("auth-page-child")).toBeTruthy();
  });

  it("the switcher is in the top-right corner (absolute positioning)", () => {
    render(
      <AuthLayout>
        <div>child</div>
      </AuthLayout>,
    );
    const wrapper = screen.getByTestId("auth-locale-switcher");
    expect(wrapper.className).toMatch(/absolute/);
    expect(wrapper.className).toMatch(/right-4/);
    expect(wrapper.className).toMatch(/top-4/);
    expect(wrapper.className).toMatch(/z-50/);
  });

  it("preserves the children below the floating switcher", () => {
    render(
      <AuthLayout>
        <main data-testid="signin-page-marker">signin content</main>
      </AuthLayout>,
    );
    expect(screen.getByTestId("signin-page-marker")).toBeTruthy();
  });
});
