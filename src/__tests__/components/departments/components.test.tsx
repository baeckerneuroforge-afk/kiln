// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepartmentStatusBadge } from "@/components/departments/department-status-badge";
import { MemoryViewer } from "@/components/departments/memory-viewer";
import { DepartmentCard } from "@/components/departments/department-card";
import { ApprovalQueue } from "@/components/departments/approval-queue";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("department UI components", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders active status with label", () => {
    render(<DepartmentStatusBadge status="ACTIVE" />);
    expect(screen.getByText("ACTIVE")).toBeTruthy();
  });

  it("renders draft status with label", () => {
    render(<DepartmentStatusBadge status="DRAFT" />);
    expect(screen.getByText("DRAFT")).toBeTruthy();
  });

  it("renders memory as formatted JSON", () => {
    render(<MemoryViewer memory={{ customer: { email: "test@example.com" } }} />);
    expect(screen.getByText(/test@example.com/)).toBeTruthy();
  });

  it("renders department card stats", () => {
    render(
      <DepartmentCard
        department={{
          id: "dept_1",
          name: "Customer Support",
          description: "Support team",
          type: "CUSTOMER_SUPPORT",
          status: "ACTIVE",
          approvalMode: "APPROVAL_FIRST",
          scheduleEnabled: false,
          scheduleCron: null,
          webhookEnabled: true,
          totalTasks: 3,
          totalApprovals: 2,
          workerAgents: [],
          createdAt: new Date().toISOString(),
        }}
      />
    );
    expect(screen.getByText("Customer Support")).toBeTruthy();
    expect(screen.getByText("3 tasks")).toBeTruthy();
    expect(screen.getByText("2 approvals")).toBeTruthy();
  });

  it("posts approval actions", async () => {
    const onChanged = vi.fn();
    render(
      <ApprovalQueue
        departmentId="dept_1"
        onChanged={onChanged}
        items={[
          {
            id: "item_1",
            triggerType: "MANUAL",
            triggerPayload: {},
            status: "NEEDS_APPROVAL",
            result: null,
            error: null,
            approvalDraft: { response: "Draft reply" },
            createdAt: new Date().toISOString(),
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith("/api/departments/dept_1/approve/item_1", { method: "POST" });
  });

  it("posts rejection actions with a reason", async () => {
    const onChanged = vi.fn();
    render(
      <ApprovalQueue
        departmentId="dept_1"
        onChanged={onChanged}
        items={[
          {
            id: "item_1",
            triggerType: "MANUAL",
            triggerPayload: {},
            status: "NEEDS_APPROVAL",
            result: null,
            error: null,
            approvalDraft: { response: "Draft reply" },
            createdAt: new Date().toISOString(),
          },
        ]}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/reason/i), { target: { value: "Needs edits" } });
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/departments/dept_1/reject/item_1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Needs edits" }) })
    );
  });
});
