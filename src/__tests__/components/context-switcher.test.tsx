// @vitest-environment jsdom

/**
 * Sprint 19.7.4.1 — SingleContextSwitcher (export name kept as
 * ContextSwitcher).
 *
 * Verifies the hierarchical rendering + click handlers:
 *   - Loading state while /api/orgs/hierarchy is in flight
 *   - Agency sections + sub-org rows
 *   - Click on a sub-org calls setActive + router.push
 *   - "Agency Overview" calls setActive + router.push("/dashboard")
 *   - Personal Workspace + standalone bucket
 *   - Action footer (Add Sub-Org + Create Organization)
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { mockPathname } = vi.hoisted(() => ({
  mockPathname: { current: "/dashboard" as string },
}));
const mockPush = vi.fn();
const mockSetActive = vi.fn().mockResolvedValue(undefined);

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, orgId: "org_agency_1" }),
  useClerk: () => ({ setActive: mockSetActive }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { ContextSwitcher } from "@/components/context-switcher";

function mockHierarchy(body: object) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  mockPathname.current = "/dashboard";
  mockFetch.mockReset();
  mockPush.mockReset();
  mockSetActive.mockClear();
});
afterEach(() => cleanup());

describe("SingleContextSwitcher", () => {
  it("shows 'Loading…' until the hierarchy fetch resolves", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ContextSwitcher />);
    expect(screen.getByText(/Loading/i)).toBeTruthy();
  });

  it("renders the agency section with its sub-orgs once data arrives", async () => {
    mockHierarchy({
      personal: null,
      agencies: [
        {
          clerkOrgId: "org_agency_1",
          name: "Hephaistos",
          imageUrl: null,
          subOrgs: [
            { subOrgId: "sub_1", clerkOrgId: "org_sub_1", name: "Müller GmbH", imageUrl: null, status: "ACTIVE" },
          ],
        },
      ],
      standaloneOrgs: [],
    });
    render(<ContextSwitcher />);
    const trigger = await screen.findByRole("button", { name: /Hephaistos/i });
    fireEvent.click(trigger);
    expect(await screen.findByTestId("switcher-agency-org_agency_1")).toBeTruthy();
    expect(screen.getByTestId("switcher-sub-org-sub_1")).toBeTruthy();
  });

  it("Agency Overview click → setActive + router.push('/dashboard')", async () => {
    mockHierarchy({
      personal: null,
      agencies: [
        {
          clerkOrgId: "org_agency_other",
          name: "Other",
          imageUrl: null,
          subOrgs: [],
        },
      ],
      standaloneOrgs: [],
    });
    render(<ContextSwitcher />);
    // Trigger label resolves to "Loading…" here (active orgId from the
    // useAuth mock doesn't match the single agency in the data), so we
    // open the dropdown via the first button on the page.
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(await screen.findByTestId("switcher-agency-org_agency_other"));
    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ organization: "org_agency_other" });
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("Sub-Org click → setActive(subOrgClerkId) + router.push('/dashboard/sub-org/<id>')", async () => {
    mockHierarchy({
      personal: null,
      agencies: [
        {
          clerkOrgId: "org_agency_1",
          name: "Hephaistos",
          imageUrl: null,
          subOrgs: [
            { subOrgId: "sub_42", clerkOrgId: "org_sub_clerk_42", name: "Acme", imageUrl: null, status: "ACTIVE" },
          ],
        },
      ],
      standaloneOrgs: [],
    });
    render(<ContextSwitcher />);
    fireEvent.click(await screen.findByRole("button", { name: /Hephaistos/i }));
    fireEvent.click(await screen.findByTestId("switcher-sub-org-sub_42"));
    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ organization: "org_sub_clerk_42" });
      expect(mockPush).toHaveBeenCalledWith("/dashboard/sub-org/sub_42");
    });
  });

  it("does not call setActive again if the target org is already active", async () => {
    mockPathname.current = "/dashboard";
    mockHierarchy({
      personal: null,
      agencies: [
        {
          clerkOrgId: "org_agency_1", // matches the active id in useAuth mock
          name: "Hephaistos",
          imageUrl: null,
          subOrgs: [],
        },
      ],
      standaloneOrgs: [],
    });
    render(<ContextSwitcher />);
    fireEvent.click(await screen.findByRole("button", { name: /Hephaistos/i }));
    fireEvent.click(await screen.findByTestId("switcher-agency-org_agency_1"));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
    expect(mockSetActive).not.toHaveBeenCalled();
  });

  it("renders the Personal Workspace under 'Other workspaces' if present", async () => {
    mockHierarchy({
      personal: { clerkOrgId: "org_personal", name: "André's Workspace", imageUrl: null },
      agencies: [],
      standaloneOrgs: [],
    });
    render(<ContextSwitcher />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(await screen.findByTestId("switcher-personal")).toBeTruthy();
  });

  it("footer always exposes Add Sub-Org + Create Organization links", async () => {
    mockHierarchy({ personal: null, agencies: [], standaloneOrgs: [] });
    render(<ContextSwitcher />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(await screen.findByTestId("switcher-add-sub-org")).toBeTruthy();
    expect(screen.getByTestId("switcher-create-organization")).toBeTruthy();
  });

  it("shows 'No workspaces yet.' when the hierarchy is empty", async () => {
    mockHierarchy({ personal: null, agencies: [], standaloneOrgs: [] });
    render(<ContextSwitcher />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(await screen.findByText(/No workspaces yet/i)).toBeTruthy();
  });
});
