// @vitest-environment jsdom

/**
 * Sprint 19.7.6 — TeamPageClient + Invite + MemberDetail modals (lite).
 *
 * Smoke-tests the orchestrator rendering + the invite/detail-modal
 * surface area. The deeper API behaviour is covered in the route tests.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { TeamPageClient } from "@/components/agency/team-page-client";

const SUB_ORGS = [
  { id: "sub_a", name: "Acme" },
  { id: "sub_b", name: "Beta" },
];

const CONSULTANT_ROW = {
  id: "am_consultant",
  userId: "user_consultant",
  role: "CONSULTANT" as const,
  name: "Lara Berater",
  email: "lara@x.de",
  invitedAt: new Date().toISOString(),
  acceptedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  assignedSubOrgCount: 1,
  subOrgAccess: [
    { id: "ac_1", subOrgId: "sub_a", permissionOverride: null },
  ],
  hasAllSubOrgs: false,
};

const OWNER_ROW = {
  id: "am_owner",
  userId: "user_owner",
  role: "OWNER" as const,
  name: "André",
  email: "andre@x.de",
  invitedAt: null,
  acceptedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  assignedSubOrgCount: 0,
  subOrgAccess: [],
  hasAllSubOrgs: true,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockListResponse(members: unknown[]) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ members }),
  });
}

describe("TeamPageClient", () => {
  it("renders an empty state when there are no members", async () => {
    mockListResponse([]);
    await act(async () => {
      render(<TeamPageClient callerUserId="user_owner" callerRole="OWNER" subOrgs={SUB_ORGS} />);
    });
    await waitFor(() => expect(screen.getByTestId("agency-team-empty")).toBeTruthy());
  });

  it("renders member rows with role badges + assignment summary", async () => {
    mockListResponse([OWNER_ROW, CONSULTANT_ROW]);
    await act(async () => {
      render(<TeamPageClient callerUserId="user_owner" callerRole="OWNER" subOrgs={SUB_ORGS} />);
    });
    await waitFor(() => expect(screen.getByTestId("agency-team-list")).toBeTruthy());

    expect(screen.getByText("André")).toBeTruthy();
    expect(screen.getByText("Lara Berater")).toBeTruthy();
    // Owner gets "alle Sub-Orgs", consultant gets explicit count.
    expect(screen.getByText("alle Sub-Orgs")).toBeTruthy();
    expect(screen.getByText("1 Sub-Org")).toBeTruthy();
  });

  it("opens the invite modal when the invite button is clicked", async () => {
    mockListResponse([]);
    await act(async () => {
      render(<TeamPageClient callerUserId="user_owner" callerRole="OWNER" subOrgs={SUB_ORGS} />);
    });
    await waitFor(() => expect(screen.getByTestId("agency-team-empty")).toBeTruthy());

    fireEvent.click(screen.getByTestId("agency-team-invite-button"));
    expect(screen.getByTestId("agency-team-invite-modal")).toBeTruthy();
    expect(screen.getByTestId("agency-team-invite-email")).toBeTruthy();
  });

  it("opens the detail modal when a row is clicked", async () => {
    mockListResponse([CONSULTANT_ROW]);
    await act(async () => {
      render(<TeamPageClient callerUserId="user_owner" callerRole="OWNER" subOrgs={SUB_ORGS} />);
    });
    await waitFor(() => expect(screen.getByTestId("agency-team-list")).toBeTruthy());

    fireEvent.click(screen.getByTestId(`agency-team-row-${CONSULTANT_ROW.id}`));
    expect(screen.getByTestId("agency-team-detail-modal")).toBeTruthy();
    expect(screen.getByTestId("agency-team-detail-role-select")).toBeTruthy();
    // Existing sub-org checkbox state preserved
    expect(screen.getByTestId("agency-team-detail-suborgs")).toBeTruthy();
  });

  it("a non-OWNER caller cannot pick the OWNER role from the invite modal", async () => {
    mockListResponse([]);
    await act(async () => {
      render(<TeamPageClient callerUserId="user_admin" callerRole="ADMIN" subOrgs={SUB_ORGS} />);
    });
    await waitFor(() => expect(screen.getByTestId("agency-team-empty")).toBeTruthy());

    fireEvent.click(screen.getByTestId("agency-team-invite-button"));
    // Owner radio should NOT be in the DOM.
    const ownerLabel = screen.queryByText("Owner");
    expect(ownerLabel).toBeNull();
  });

  it("hides the delete button on the caller's own row", async () => {
    mockListResponse([{ ...OWNER_ROW, userId: "user_caller" }]);
    await act(async () => {
      render(<TeamPageClient callerUserId="user_caller" callerRole="OWNER" subOrgs={SUB_ORGS} />);
    });
    await waitFor(() => expect(screen.getByTestId("agency-team-list")).toBeTruthy());

    fireEvent.click(screen.getByTestId(`agency-team-row-${OWNER_ROW.id}`));
    expect(screen.queryByTestId("agency-team-detail-delete")).toBeNull();
  });
});
