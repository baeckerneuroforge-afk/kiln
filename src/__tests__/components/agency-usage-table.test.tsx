// @vitest-environment jsdom

/**
 * Sprint 19.7.5 — AgencyUsageTable client component.
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AgencyUsageTable } from "@/components/agency/agency-usage-table";
import type { AgencyUsage } from "@/lib/agency/get-agency-usage";

function baseUsage(): AgencyUsage {
  return {
    period: "month",
    since: new Date(),
    until: new Date(),
    totals: {
      conversationCount: 10,
      llmCalls: 20,
      inputTokens: 500,
      outputTokens: 200,
      cachedInputTokens: 30,
      costUsd: 1.5,
    },
    perSubOrg: [
      {
        subOrgId: "sub_a",
        clerkOrgId: "child_a",
        subOrgName: "Acme",
        subOrgStatus: "ACTIVE",
        conversationCount: 6,
        llmCalls: 12,
        inputTokens: 300,
        outputTokens: 100,
        cachedInputTokens: 20,
        costUsd: 1.2,
      },
      {
        subOrgId: "sub_b",
        clerkOrgId: "child_b",
        subOrgName: "Beta",
        subOrgStatus: "ARCHIVED",
        conversationCount: 4,
        llmCalls: 8,
        inputTokens: 200,
        outputTokens: 100,
        cachedInputTokens: 10,
        costUsd: 0.3,
      },
    ],
  };
}

afterEach(() => cleanup());

describe("AgencyUsageTable", () => {
  it("renders the totals row + per-sub-org rows", () => {
    render(<AgencyUsageTable usage={baseUsage()} period="month" />);
    expect(screen.getByTestId("agency-usage-rows")).toBeTruthy();
    expect(screen.getByTestId("agency-usage-row-sub_a")).toBeTruthy();
    expect(screen.getByTestId("agency-usage-row-sub_b")).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
  });

  it("renders the empty state when there are no sub-orgs", () => {
    const empty = baseUsage();
    empty.perSubOrg = [];
    render(<AgencyUsageTable usage={empty} period="month" />);
    expect(screen.getByTestId("agency-usage-empty")).toBeTruthy();
  });

  it("sort headers toggle direction on subsequent clicks", () => {
    render(<AgencyUsageTable usage={baseUsage()} period="month" />);
    // Initial sort key is costUsd, direction desc → Acme row (1.2) comes first.
    const initialOrder = screen.getAllByTestId(/agency-usage-row-/);
    expect((initialOrder[0] as HTMLElement).getAttribute("data-testid")).toBe(
      "agency-usage-row-sub_a",
    );

    // First click on a new key defaults to desc → Beta first alphabetically.
    fireEvent.click(screen.getByTestId("agency-usage-sort-subOrgName"));
    const desc = screen.getAllByTestId(/agency-usage-row-/);
    expect((desc[0] as HTMLElement).getAttribute("data-testid")).toBe(
      "agency-usage-row-sub_b",
    );

    // Second click on the same key toggles to asc → Acme first.
    fireEvent.click(screen.getByTestId("agency-usage-sort-subOrgName"));
    const asc = screen.getAllByTestId(/agency-usage-row-/);
    expect((asc[0] as HTMLElement).getAttribute("data-testid")).toBe(
      "agency-usage-row-sub_a",
    );
  });

  it("CSV export link includes the active period", () => {
    render(<AgencyUsageTable usage={baseUsage()} period="week" />);
    const link = screen.getByTestId("agency-usage-export-csv") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/api/agency/usage?period=week&format=csv");
  });

  it("links to the period siblings", () => {
    render(<AgencyUsageTable usage={baseUsage()} period="month" />);
    const week = screen.getByTestId("agency-usage-period-week") as HTMLAnchorElement;
    expect(week.getAttribute("href")).toBe("/dashboard/agency/usage?period=week");
  });
});
