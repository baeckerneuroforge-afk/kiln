// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Router + searchParams mocks
const { mockReplace, mockSearchParams } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockSearchParams: { value: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSearchParams.value),
}));

// Stub the heavy children — we only test the shell + tab switching here.
vi.mock("@/components/knowledge/knowledge-bases-hub", () => ({
  KnowledgeBasesHubView: () => <div data-testid="bases-view" />,
}));

vi.mock("@/components/knowledge/knowledge-graph-view", () => ({
  default: () => <div data-testid="graph-view" />,
}));

import { KnowledgePageShell } from "@/components/knowledge/knowledge-page-shell";

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams.value = "";
});

afterEach(() => {
  cleanup();
});

describe("KnowledgePageShell", () => {
  it("defaults to the Bases tab when ?tab is missing", () => {
    render(<KnowledgePageShell planHasGraph planHasVisual />);
    expect(screen.getByTestId("bases-view")).toBeInTheDocument();
    expect(screen.queryByTestId("graph-view")).not.toBeInTheDocument();
    const basesTab = screen.getByRole("tab", { name: /bases/i });
    expect(basesTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders the Graph tab when ?tab=graph", () => {
    mockSearchParams.value = "tab=graph";
    render(<KnowledgePageShell planHasGraph planHasVisual />);
    expect(screen.getByTestId("graph-view")).toBeInTheDocument();
    expect(screen.queryByTestId("bases-view")).not.toBeInTheDocument();
  });

  it("clicking a tab updates the URL via router.replace", () => {
    render(<KnowledgePageShell planHasGraph planHasVisual />);
    fireEvent.click(screen.getByRole("tab", { name: /graph/i }));
    expect(mockReplace).toHaveBeenCalledWith("/dashboard/knowledge?tab=graph");
  });

  it("renders the right page heading per tab", () => {
    const { rerender } = render(
      <KnowledgePageShell planHasGraph planHasVisual />,
    );
    expect(screen.getByText("Knowledge Bases")).toBeInTheDocument();

    mockSearchParams.value = "tab=graph";
    rerender(<KnowledgePageShell planHasGraph planHasVisual />);
    expect(screen.getByText("Knowledge Graph")).toBeInTheDocument();
  });
});
