// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  openUserProfile: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  usePathname: () => "/dashboard/settings",
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: {
      firstName: "Ada",
      username: "ada",
      fullName: "Ada Lovelace",
      imageUrl: "",
      emailAddresses: [{ emailAddress: "ada@example.com" }],
    },
  }),
  useClerk: () => ({ openUserProfile: mocks.openUserProfile }),
  useOrganization: () => ({
    organization: { id: "org_123", name: "Acme" },
    membership: { role: "org:admin" },
    isLoaded: true,
  }),
  OrganizationProfile: () => <div data-testid="organization-profile">Organization Profile</div>,
}));

vi.mock("@/components/credit-usage-chart", () => ({
  CreditUsageChart: () => <div data-testid="credit-usage-chart" />,
}));

vi.mock("@/components/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import SettingsPage from "@/app/dashboard/settings/page";

function setSearch(query = "") {
  mocks.searchParams = new URLSearchParams(query);
}

function mockSettingsFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url === "/api/stripe/plan") {
      return new Response(JSON.stringify({
        plan: "PRO",
        agentCount: 2,
        chatCount: 10,
        limits: { agents: 10, chatsPerMonth: 2000 },
      }), { status: 200 });
    }
    if (url === "/api/stripe/invoices") {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url === "/api/referral") {
      return new Response(JSON.stringify({
        referralCode: "KILN-TEST",
        referredUsers: 3,
        pendingUsers: 2,
        convertedUsers: 1,
        creditsEarned: 1,
      }), { status: 200 });
    }
    if (url === "/api/user/api-keys") {
      return new Response(JSON.stringify([
        { id: "key_1", provider: "anthropic", keyHint: "sk-ant-***xy12" },
      ]), { status: 200 });
    }
    if (url === "/api/credits") {
      return new Response(JSON.stringify({
        balance: 1000,
        totalCredits: 2000,
        monthlyCredits: 2000,
        resetDate: "2026-05-16T00:00:00.000Z",
        byokActive: true,
        byokKeyCount: 1,
        plan: "PRO",
        creditTier: 0,
        tiers: [{ credits: 2000, monthlyPrice: 99, yearlyPrice: 832 }],
        isAdmin: false,
        usage: { dailyUsage: [], topAgents: [], totalUsed: 0, byType: [] },
      }), { status: 200 });
    }
    if (url === "/api/user/api-access-keys") {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url === "/api/user/webhooks") {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.startsWith("/api/marketplace")) {
      return new Response(JSON.stringify({ templates: [] }), { status: 200 });
    }

    return new Response(JSON.stringify({}), { status: 200 });
  }));
}

beforeEach(() => {
  setSearch();
  mocks.replace.mockClear();
  mocks.push.mockClear();
  mocks.openUserProfile.mockClear();
  mockSettingsFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Settings tab navigation", () => {
  it("renders all settings tabs and defaults to Profile", async () => {
    render(<SettingsPage />);

    await screen.findByRole("tab", { name: /profile/i });

    expect(screen.getByRole("tab", { name: /billing/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /api keys/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /webhooks/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /referral/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /my templates/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /organization/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /danger zone/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /profile/i })).toHaveAttribute("aria-selected", "true");
  });

  it("opens a direct tab link from the URL", async () => {
    setSearch("tab=billing");

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /billing/i })).toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByRole("heading", { name: "Current Plan" })).toBeInTheDocument();
  });

  it("defaults invalid tab parameters back to Profile", async () => {
    setSearch("tab=missing");

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /profile/i })).toHaveAttribute("aria-selected", "true");
    });
  });

  it("writes URL state when a tab changes", async () => {
    render(<SettingsPage />);

    const billingTab = await screen.findByRole("tab", { name: /billing/i });
    fireEvent.click(billingTab);

    expect(mocks.replace).toHaveBeenCalledWith("/dashboard/settings?tab=billing", { scroll: false });
  });

  it("opens Clerk account settings from Profile", async () => {
    render(<SettingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /open clerk account settings/i }));

    expect(mocks.openUserProfile).toHaveBeenCalledOnce();
  });
});
