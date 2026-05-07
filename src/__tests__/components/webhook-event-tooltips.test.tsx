// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams("tab=webhooks"),
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
      fullName: "Ada Lovelace",
      imageUrl: "",
      emailAddresses: [{ emailAddress: "ada@example.com" }],
    },
  }),
  useClerk: () => ({ openUserProfile: vi.fn() }),
  useOrganization: () => ({ organization: null, membership: null, isLoaded: true }),
  OrganizationProfile: () => <div />,
}));

vi.mock("@/components/credit-usage-chart", () => ({
  CreditUsageChart: () => <div />,
}));

vi.mock("@/components/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import SettingsPage from "@/app/dashboard/settings/page";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url === "/api/stripe/plan") {
      return new Response(JSON.stringify({
        plan: "PRO",
        agentCount: 1,
        chatCount: 1,
        limits: { agents: 10, chatsPerMonth: 2000 },
      }), { status: 200 });
    }
    if (url === "/api/user/webhooks") {
      return new Response(JSON.stringify([
        {
          id: "wh_1",
          url: "https://example.com/hook",
          events: ["conversation.started", "lead.scored"],
          secret: "whsec_1234567890abcdef",
          active: true,
          createdAt: "2026-05-07T00:00:00.000Z",
          deliveries: [],
        },
      ]), { status: 200 });
    }
    if (url === "/api/referral") {
      return new Response(JSON.stringify({ referralCode: "KILN-TEST" }), { status: 200 });
    }
    if (url === "/api/credits") {
      return new Response(JSON.stringify({
        balance: 100,
        totalCredits: 2000,
        usage: { dailyUsage: [], topAgents: [], totalUsed: 0, byType: [] },
      }), { status: 200 });
    }
    if (url === "/api/stripe/invoices" || url === "/api/user/api-keys" || url === "/api/user/api-access-keys") {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.startsWith("/api/marketplace")) {
      return new Response(JSON.stringify({ templates: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Settings webhook event tooltips", () => {
  it("explains selectable webhook events", async () => {
    render(<SettingsPage />);

    const conversationStarted = await screen.findByRole("button", { name: /conversation started/i });

    expect(conversationStarted).toHaveAttribute(
      "title",
      "Conversation Started: Fires when a user begins a chat with one of your agents.",
    );
  });

  it("explains configured event pills and renders the test button", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("conversation.started")).toHaveAttribute(
        "title",
        "Conversation Started: Fires when a user begins a chat with one of your agents.",
      );
    });
    expect(screen.getByRole("button", { name: /send test event/i })).toBeInTheDocument();
  });
});
