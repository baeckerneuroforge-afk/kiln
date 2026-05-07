// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Clerk + navigation mocks (component pulls these in) ────────
const setActive = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ setActive }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const toast = vi.fn();
vi.mock("@/components/toast", () => ({
  useToast: () => ({ toast }),
}));

// ── Fetch mock — list endpoint ─────────────────────────────────
const FAKE_LIST = {
  subOrgs: [
    {
      id: "rel-1",
      childOrgId: "org_acme",
      name: "Acme Corp",
      status: "ACTIVE",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      agentCount: 3,
    },
    {
      id: "rel-2",
      childOrgId: "org_widgets",
      name: "Widgets Inc",
      status: "ARCHIVED",
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      agentCount: 0,
    },
  ],
};

const fetchMock = vi.fn(async (url: string) => {
  if (url.includes("/api/agency/sub-orgs")) {
    return new Response(JSON.stringify(FAKE_LIST), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response("not mocked", { status: 404 });
});

// ── Test target — load AFTER mocks ─────────────────────────────
import AgencySubOrgsPage from "@/app/dashboard/agency/sub-orgs/page";

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Agency sub-orgs list — clickable cards", () => {
  it("renders a Link to the detail page for each sub-org", async () => {
    render(<AgencySubOrgsPage />);

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
      expect(screen.getByText("Widgets Inc")).toBeInTheDocument();
    });

    const links = screen.getAllByTestId("sub-org-card-link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/dashboard/agency/sub-orgs/rel-1");
    expect(links[1]).toHaveAttribute("href", "/dashboard/agency/sub-orgs/rel-2");
  });

  it("clicking a quick-action button does not bubble to the link", async () => {
    render(<AgencySubOrgsPage />);

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    });

    // Active card has 3 quick-action buttons; archived card has none.
    const archiveButtons = screen.getAllByRole("button", { name: /archive/i });
    expect(archiveButtons.length).toBeGreaterThan(0);

    // confirm() in handleArchive is stubbed to "no" so the test stays
    // synchronous; we verify push wasn't called (no navigation).
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(archiveButtons[0]);
    expect(push).not.toHaveBeenCalled();
  });

  it("does not render quick actions for ARCHIVED sub-orgs", async () => {
    render(<AgencySubOrgsPage />);
    await waitFor(() => {
      expect(screen.getByText("Widgets Inc")).toBeInTheDocument();
    });

    // The archived row has no Login-as-client / Invite / Archive buttons —
    // exactly one Login button overall (for Acme).
    const loginButtons = screen.getAllByRole("button", {
      name: /login as client/i,
    });
    expect(loginButtons).toHaveLength(1);
  });
});
