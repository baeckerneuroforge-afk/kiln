// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Clerk + navigation + toast mocks ───────────────────────────
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

// ── Fetch mock — every endpoint the detail page hits on mount ──
const META = {
  id: "rel-abc",
  childOrgId: "org_acme",
  name: "Acme Corp",
  status: "ACTIVE",
  createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  pricingMode: "NONE",
};

const STATS = {
  activeAgents: 3,
  totalAgents: 5,
  activeWorkflows: 2,
  totalWorkflows: 3,
  conversations30d: 41,
  lastActivityAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  mrrCents: 0,
  mrrCurrency: "eur",
  subscriptionStatus: null,
};

const ACTIVITY = {
  items: [
    {
      id: "ev1",
      userId: "u1",
      category: "agent",
      action: "agent.created",
      resourceId: "ag1",
      resourceType: "Agent",
      severity: "info",
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
  ],
  nextCursor: null,
};

const fetchMock = vi.fn(async (url: string) => {
  if (url.endsWith("/api/agency/sub-orgs/rel-abc")) {
    return new Response(JSON.stringify(META), { status: 200 });
  }
  if (url.endsWith("/stats")) {
    return new Response(JSON.stringify(STATS), { status: 200 });
  }
  if (url.includes("/activity")) {
    return new Response(JSON.stringify(ACTIVITY), { status: 200 });
  }
  return new Response("{}", { status: 200 });
});

const fakeParams = { id: "rel-abc" };

// ── Test target — load AFTER mocks ─────────────────────────────
import SubOrgDetailPage from "@/app/dashboard/agency/sub-orgs/[id]/page";

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Sub-org detail page", () => {
  it("renders the top bar with name, status, and quick actions", async () => {
    render(<SubOrgDetailPage params={fakeParams} />);

    await waitFor(() => {
      expect(screen.getByTestId("sub-org-name")).toHaveTextContent("Acme Corp");
    });
    expect(screen.getByTestId("sub-org-status")).toHaveTextContent("ACTIVE");
    expect(
      screen.getByRole("button", { name: /login as client/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /archive/i })).toBeInTheDocument();
  });

  it("starts on the Overview tab and renders KPI cards", async () => {
    render(<SubOrgDetailPage params={fakeParams} />);

    await waitFor(() => {
      expect(screen.getByTestId("overview-tab")).toBeInTheDocument();
    });

    // Active agents value
    expect(screen.getByText("Active agents")).toBeInTheDocument();
    expect(screen.getByText("Active workflows")).toBeInTheDocument();
    expect(screen.getByText("Conversations (30d)")).toBeInTheDocument();
    expect(screen.getByText("MRR")).toBeInTheDocument();
  });

  it("can navigate to all tabs without crashing", async () => {
    render(<SubOrgDetailPage params={fakeParams} />);
    await waitFor(() => {
      expect(screen.getByTestId("overview-tab")).toBeInTheDocument();
    });

    // Each tab button exists and switching renders the corresponding panel.
    const tabs = ["Agents", "Workflows", "Members", "Pricing", "Branding", "Activity"];
    for (const label of tabs) {
      const tabButton = screen.getByRole("tab", { name: new RegExp(label, "i") });
      fireEvent.click(tabButton);
      await waitFor(() => {
        expect(tabButton).toHaveAttribute("aria-selected", "true");
      });
    }
  });

  it("shows the archived banner when status is ARCHIVED", async () => {
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ ...META, status: "ARCHIVED" }), {
        status: 200,
      }),
    );
    render(<SubOrgDetailPage params={fakeParams} />);
    await waitFor(() => {
      expect(screen.getByText(/this sub-org is archived/i)).toBeInTheDocument();
    });
    // Archive button is suppressed
    expect(
      screen.queryByRole("button", { name: /archive/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the load error when the meta fetch fails", async () => {
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ error: "Sub-org not found" }), {
        status: 404,
      }),
    );
    render(<SubOrgDetailPage params={fakeParams} />);
    await waitFor(() => {
      expect(screen.getByText(/sub-org not found/i)).toBeInTheDocument();
    });
  });
});
