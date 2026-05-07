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

import { KnowledgeBasesHubView } from "@/components/knowledge/knowledge-bases-hub";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const STATS_FULL = {
  totalBases: 2,
  totalDocuments: 12,
  totalSizeBytes: 1024 * 250,
  agentsUsingKnowledge: 2,
  bases: [
    {
      agentId: "ag1",
      agentName: "Sales Bot",
      agentSlug: "sales-bot",
      documentCount: 8,
      sizeBytes: 1024 * 200,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      types: ["PDF", "URL"],
      sharedWith: [],
    },
    {
      agentId: "ag2",
      agentName: "Support Bot",
      agentSlug: "support-bot",
      documentCount: 4,
      sizeBytes: 1024 * 50,
      updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      types: ["FAQ"],
      sharedWith: [],
    },
  ],
};

const STATS_EMPTY = {
  totalBases: 0,
  totalDocuments: 0,
  totalSizeBytes: 0,
  agentsUsingKnowledge: 0,
  bases: [],
};

describe("KnowledgeBasesHubView", () => {
  it("renders the empty-state CTA when no bases exist", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(STATS_EMPTY), { status: 200 }),
    );
    render(<KnowledgeBasesHubView />);
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-bases-empty")).toBeInTheDocument();
    });
    expect(screen.getByText(/no knowledge bases yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open agents/i })).toHaveAttribute(
      "href",
      "/dashboard/agents",
    );
  });

  it("renders stats cards and the bases list", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(STATS_FULL), { status: 200 }),
    );
    render(<KnowledgeBasesHubView />);
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-bases-hub")).toBeInTheDocument();
    });
    expect(screen.getByText("Sales Bot")).toBeInTheDocument();
    expect(screen.getByText("Support Bot")).toBeInTheDocument();
    // Stats values render
    expect(screen.getByText("Knowledge Bases")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
  });

  it("each base card links to the agent's knowledge tab", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(STATS_FULL), { status: 200 }),
    );
    render(<KnowledgeBasesHubView />);
    await waitFor(() => {
      expect(screen.getByText("Sales Bot")).toBeInTheDocument();
    });
    const link = screen
      .getByText("Sales Bot")
      .closest("a") as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toBe(
      "/dashboard/agents/ag1?tab=knowledge",
    );
  });

  it("filters the bases list locally by agent name", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(STATS_FULL), { status: 200 }),
    );
    render(<KnowledgeBasesHubView />);
    await waitFor(() => {
      expect(screen.getByText("Sales Bot")).toBeInTheDocument();
    });
    const search = screen.getByPlaceholderText(/search across all knowledge/i);
    fireEvent.change(search, { target: { value: "Support" } });
    // After typing, "Sales Bot" disappears from filteredBases list (header
    // "All bases" still appears with count 1)
    await waitFor(() => {
      expect(screen.queryByText("Sales Bot")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Support Bot")).toBeInTheDocument();
  });

  it("shows error state when /api/knowledge/bases fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );
    render(<KnowledgeBasesHubView />);
    await waitFor(() => {
      expect(screen.getByText(/boom/i)).toBeInTheDocument();
    });
  });
});
