// @vitest-environment jsdom

/**
 * Sprint 19.6.1 — empty-state CTA on /dashboard/agency/sub-orgs when
 * the agency has no sub-orgs yet.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  useOrganizationList: () => ({ setActive: vi.fn() }),
  useClerk: () => ({ setActive: vi.fn() }),
  useUser: () => ({ user: { id: "user_1" } }),
}));

vi.mock("@/components/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import SubOrgsPage from "@/app/dashboard/agency/sub-orgs/page";

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) => {
    if (url.endsWith("/api/agency/sub-orgs")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ subOrgs: [] }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
});
afterEach(() => cleanup());

describe("SubOrgs empty state (Sprint 19.6.1)", () => {
  it("renders German copy + 'Create your first Sub-Org' CTA", async () => {
    render(<SubOrgsPage />);
    expect(await screen.findByText("Noch keine Sub-Orgs.")).toBeTruthy();
    expect(screen.getByText(/Lege deine erste an um zu starten/)).toBeTruthy();
    expect(screen.getByTestId("sub-orgs-empty-cta")).toBeTruthy();
  });

  it("opens the create dialog when the empty-state CTA is clicked", async () => {
    render(<SubOrgsPage />);
    const cta = await screen.findByTestId("sub-orgs-empty-cta");
    fireEvent.click(cta);
    // The create dialog uses the "Acme Corp" placeholder on its input
    // — its appearance confirms the click flipped setCreateOpen(true).
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Acme Corp")).toBeTruthy();
    });
  });
});
