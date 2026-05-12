// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock state — pathname controls which item is "active"
const { mockPathname } = vi.hoisted(() => ({
  mockPathname: { current: "/dashboard" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: {
      firstName: "Andre",
      imageUrl: null,
      emailAddresses: [{ emailAddress: "test@example.com" }],
    },
  }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/components/whats-new", () => ({
  WhatsNewBell: () => <div data-testid="whats-new-bell" />,
}));

vi.mock("@/components/org-switcher", () => ({
  OrgChangeRefresh: () => null,
}));

vi.mock("@/components/context-switcher", () => ({
  ContextSwitcher: () => <div data-testid="context-switcher" />,
}));

vi.mock("@/components/agency-org-switcher", () => ({
  AgencyOrgSwitcher: () => <div data-testid="agency-org-switcher" />,
}));

vi.mock("@/hooks/use-advanced-mode", () => ({
  useAdvancedMode: () => ({ advancedMode: false, setAdvancedMode: vi.fn() }),
}));

const fetchMock = vi.fn(async (url: string) => {
  if (url.includes("/api/stripe/plan")) {
    return new Response(
      JSON.stringify({ plan: "ADMIN", agentCount: 5 }),
      { status: 200 },
    );
  }
  if (url.includes("/api/agency/branding")) {
    return new Response(JSON.stringify({}), { status: 200 });
  }
  return new Response("{}", { status: 200 });
});

import { Sidebar } from "@/components/sidebar";

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  // jsdom doesn't implement localStorage by default in some envs —
  // but vitest-jsdom does. Reset the keys we touch.
  try {
    localStorage.removeItem("kiln-sidebar-collapsed");
    localStorage.removeItem("kiln-sidebar-sections");
  } catch { /* */ }
  mockPathname.current = "/dashboard";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Sidebar polish", () => {
  it("marks the active item with kiln-orange styling", async () => {
    mockPathname.current = "/dashboard/agents";
    render(<Sidebar />);
    // Find the Agents nav link and confirm the active classes are applied
    const agentsLink = await screen.findByRole("link", { name: /agents/i });
    expect(agentsLink.className).toMatch(/text-kiln-orange/);
    expect(agentsLink.className).toMatch(/bg-kiln-orange\/10/);
    expect(agentsLink.className).toMatch(/font-semibold/);
  });

  it("does not apply active styling to non-matching items", async () => {
    mockPathname.current = "/dashboard/agents";
    render(<Sidebar />);
    const dashboardLink = await screen.findByRole("link", { name: /^dashboard$/i });
    expect(dashboardLink.className).not.toMatch(/bg-kiln-orange\/10/);
    expect(dashboardLink.className).toMatch(/text-muted-foreground/);
  });

  it("treats nested routes as active for the parent item", async () => {
    // /dashboard/agents/123 → "Agents" should still light up
    mockPathname.current = "/dashboard/agents/123";
    render(<Sidebar />);
    const agentsLink = await screen.findByRole("link", { name: /agents/i });
    expect(agentsLink.className).toMatch(/text-kiln-orange/);
  });

  it("toggles collapsed state on Cmd+B", async () => {
    render(<Sidebar />);
    // Find aside; assume default expanded (w-60)
    const aside = await waitFor(() => {
      const a = document.querySelector("aside");
      if (!a) throw new Error("aside not found");
      return a;
    });
    expect(aside.className).toMatch(/w-60/);

    fireEvent.keyDown(document, { key: "b", metaKey: true });

    await waitFor(() => {
      expect(aside.className).toMatch(/lg:w-\[60px\]/);
    });
  });

  it("ignores Cmd+B while typing in an input", async () => {
    render(<Sidebar />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const aside = document.querySelector("aside")!;
    expect(aside.className).toMatch(/w-60/);
    fireEvent.keyDown(input, { key: "b", metaKey: true });

    // Sidebar should still be expanded
    expect(aside.className).toMatch(/w-60/);
    document.body.removeChild(input);
  });

  it("renders an admin avatar with the kiln-orange ring", async () => {
    render(<Sidebar />);
    // Avatar is the first letter inside an aria-labeled account button.
    const accountBtn = await screen.findByRole("button", {
      name: /open account menu/i,
    });
    const avatar = accountBtn.querySelector("div.rounded-full");
    expect(avatar).toBeTruthy();
    expect(avatar?.className).toMatch(/ring-kiln-orange/);
  });
});
