// @vitest-environment jsdom

/**
 * Sprint 19.7.6.1 — MembershipsPageClient.
 *
 * Smoke-tests the orchestrator: invite-CTA visibility per permission,
 * empty state, and modal toggle. The actual POST + form behaviour is
 * covered by invite-sub-org-member-modal.test.tsx.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  MembershipsPageClient,
  type MembershipRow,
} from "@/components/sub-org/memberships-page-client";

afterEach(() => cleanup());

const SAMPLE: MembershipRow = {
  id: "mem_1",
  userId: "user_1",
  role: "MEMBER",
  permissionSet: "USE_AGENTS",
  displayName: "Lara Berater",
  email: "lara@kunde.de",
  pending: false,
};

describe("MembershipsPageClient", () => {
  it("renders the invite CTA when canManage = true", () => {
    render(
      <MembershipsPageClient
        subOrgId="sub_abc"
        subOrgName="Acme"
        canManage={true}
        members={[SAMPLE]}
      />,
    );
    expect(screen.getByTestId("sub-org-memberships-invite-cta")).toBeTruthy();
    expect(screen.queryByTestId("sub-org-memberships-readonly-badge")).toBeNull();
  });

  it("hides the invite CTA and shows the read-only badge when canManage = false", () => {
    render(
      <MembershipsPageClient
        subOrgId="sub_abc"
        subOrgName="Acme"
        canManage={false}
        members={[SAMPLE]}
      />,
    );
    expect(screen.queryByTestId("sub-org-memberships-invite-cta")).toBeNull();
    expect(screen.getByTestId("sub-org-memberships-readonly-badge")).toBeTruthy();
  });

  it("renders the empty state when there are no members", () => {
    render(
      <MembershipsPageClient
        subOrgId="sub_abc"
        subOrgName="Acme"
        canManage={true}
        members={[]}
      />,
    );
    expect(screen.getByTestId("sub-org-memberships-empty")).toBeTruthy();
    expect(screen.queryByTestId("sub-org-memberships-list")).toBeNull();
  });

  it("opens the invite modal on CTA click", () => {
    render(
      <MembershipsPageClient
        subOrgId="sub_abc"
        subOrgName="Acme"
        canManage={true}
        members={[]}
      />,
    );
    expect(screen.queryByTestId("sub-org-memberships-invite-modal")).toBeNull();
    fireEvent.click(screen.getByTestId("sub-org-memberships-invite-cta"));
    expect(screen.getByTestId("sub-org-memberships-invite-modal")).toBeTruthy();
  });

  it("renders the pending badge for memberships without acceptedAt", () => {
    render(
      <MembershipsPageClient
        subOrgId="sub_abc"
        subOrgName="Acme"
        canManage={true}
        members={[{ ...SAMPLE, pending: true }]}
      />,
    );
    expect(screen.getByText(/Einladung ausstehend/)).toBeTruthy();
  });
});
