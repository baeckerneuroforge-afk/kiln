// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityFeed } from "@/components/operations/activity-feed";
import { ApprovalsCrossQueue } from "@/components/operations/approvals-cross-queue";
import { CustomerHealthCard } from "@/components/operations/customer-health-card";
import { OpsEmptyState } from "@/components/operations/ops-empty-state";
import { StatsRow, formatCompactNumber, formatEuro } from "@/components/operations/stats-row";
import { TimeRangeSelector } from "@/components/operations/time-range-selector";
import type { CustomerHealth } from "@/lib/operations/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

afterEach(cleanup);

const customer: CustomerHealth = {
  subOrgId: "org_child_1",
  relationshipId: "rel_1",
  name: "Praxis Dr. Schmidt",
  logoUrl: null,
  status: "CRITICAL",
  approvalsPending: 12,
  activeDepartments: 3,
  failedRuns24h: 1,
  tokensUsed: 1200,
  costEur: 0.02,
  lastActivityAt: new Date().toISOString(),
  openHref: "/dashboard/agency/sub-orgs/rel_1",
};

describe("operations UI components", () => {
  it("formats compact numbers and euro values", () => {
    expect(formatCompactNumber(1_200_000)).toBe("1.2M");
    expect(formatEuro(24.5)).toContain("24,50");
  });

  it("renders stats row values and warning pulse trigger text", () => {
    render(
      <StatsRow
        stats={{
          totalCustomers: 23,
          activeDepartments: 47,
          pendingApprovals: 12,
          failedRuns24h: 3,
          tokensUsed: 1_200_000,
          tokenCostEur: 24.5,
          revenueEur: 4891,
        }}
      />
    );
    expect(screen.getByText("23")).toBeTruthy();
    expect(screen.getByText("Pending Approvals")).toBeTruthy();
    expect(screen.getByText(/24,50/)).toBeTruthy();
  });

  it("renders customer health card with critical status and stats", () => {
    render(<CustomerHealthCard customer={customer} />);
    expect(screen.getByText("Praxis Dr. Schmidt")).toBeTruthy();
    expect(screen.getByText("CRITICAL")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByRole("link", { name: /open customer/i }).getAttribute("href")).toBe("/dashboard/agency/sub-orgs/rel_1");
  });

  it("renders cross-customer approvals with draft previews", () => {
    render(
      <ApprovalsCrossQueue
        approvals={[
          {
            id: "item_1",
            departmentId: "dept_1",
            departmentName: "Customer Support",
            customerName: "Auto Mayer",
            customerOrgId: "org_child_2",
            channel: "EMAIL",
            draftPreview: "Reset password instructions",
            waitMinutes: 6,
            createdAt: new Date().toISOString(),
            href: "/dashboard/departments/dept_1/approvals",
          },
        ]}
      />
    );
    expect(screen.getByText("Auto Mayer")).toBeTruthy();
    expect(screen.getByText("Reset password instructions")).toBeTruthy();
  });

  it("renders empty approvals state", () => {
    render(<ApprovalsCrossQueue approvals={[]} />);
    expect(screen.getByText(/No pending approvals/)).toBeTruthy();
  });

  it("renders activity feed items sorted by caller data", () => {
    render(
      <ActivityFeed
        events={[
          {
            id: "event_1",
            customerName: "Bäckerei Hoffmann",
            departmentName: "Lead Qualification",
            title: "Bäckerei Hoffmann — Lead-Qualification scored 14 leads",
            description: "WORKFLOW run · 200ms",
            timestamp: new Date().toISOString(),
            href: "/dashboard/departments/dept_1",
            severity: "info",
          },
        ]}
      />
    );
    expect(screen.getByText(/scored 14 leads/)).toBeTruthy();
  });

  it("calls time-range selector change handler", () => {
    const onChange = vi.fn();
    render(<TimeRangeSelector value="today" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    expect(onChange).toHaveBeenCalledWith("week");
  });

  it("renders empty state links for single-sub-org users", () => {
    render(<OpsEmptyState redirectTarget="/dashboard/agency/sub-orgs/rel_1" />);
    expect(screen.getByRole("link", { name: "Open customer" }).getAttribute("href")).toBe("/dashboard/agency/sub-orgs/rel_1");
    expect(screen.getByRole("link", { name: "Create Sub-Org" })).toBeTruthy();
  });
});
