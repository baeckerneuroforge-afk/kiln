// @vitest-environment jsdom

/**
 * Sprint 19.7.2 — ContextSwitcher rendering + dropdown behavior.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { mockPathname } = vi.hoisted(() => ({
  mockPathname: { current: "/dashboard" as string },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { ContextSwitcher } from "@/components/context-switcher";

function mockSubOrgsResponse(subOrgs: Array<Record<string, unknown>>) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ subOrgs }),
  } as Response);
}

beforeEach(() => {
  mockPathname.current = "/dashboard";
  mockFetch.mockReset();
});
afterEach(() => cleanup());

describe("ContextSwitcher", () => {
  it("hides itself when the user has no sub-org memberships", async () => {
    mockSubOrgsResponse([]);
    const { container } = render(<ContextSwitcher />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders 'Agency Overview' label when pathname is /dashboard", async () => {
    mockSubOrgsResponse([
      { subOrgId: "sub_1", name: "Acme", status: "ACTIVE" },
    ]);
    render(<ContextSwitcher />);
    expect(await screen.findByText("Agency Overview")).toBeTruthy();
  });

  it("shows the matching sub-org name when in /dashboard/sub-org/[id]", async () => {
    mockPathname.current = "/dashboard/sub-org/sub_1";
    mockSubOrgsResponse([
      { subOrgId: "sub_1", name: "Acme", status: "ACTIVE" },
      { subOrgId: "sub_2", name: "Beta", status: "ACTIVE" },
    ]);
    render(<ContextSwitcher />);
    expect(await screen.findByText("Acme")).toBeTruthy();
  });

  it("filters out non-ACTIVE sub-orgs from the dropdown", async () => {
    mockSubOrgsResponse([
      { subOrgId: "sub_1", name: "Acme", status: "ACTIVE" },
      { subOrgId: "sub_2", name: "Gone", status: "ARCHIVED" },
    ]);
    render(<ContextSwitcher />);
    const trigger = await screen.findByRole("button", { name: /Agency Overview/i });
    fireEvent.click(trigger);
    expect(screen.queryByText("Gone")).toBeNull();
    expect(screen.getByText("Acme")).toBeTruthy();
  });

  it("opens the dropdown with both Agency Overview and the user's sub-orgs", async () => {
    mockSubOrgsResponse([
      { subOrgId: "sub_1", name: "Acme", status: "ACTIVE" },
    ]);
    render(<ContextSwitcher />);
    const trigger = await screen.findByRole("button", { name: /Agency Overview/i });
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});
