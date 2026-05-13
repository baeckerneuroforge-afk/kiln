/**
 * Sprint 19.7.5.1 — /dashboard/sub-org/[subOrgId] root (Bug 1).
 *
 * Verifies the dashboard renders real stats + recent-conversation feed
 * + quick-links + handles empty state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

class NotFoundError extends Error {
  constructor() {
    super("NotFound");
    this.name = "NotFoundError";
  }
}

class RedirectError extends Error {
  constructor(public url: string) {
    super(`Redirect: ${url}`);
    this.name = "RedirectError";
  }
}

const mockAuth = vi.hoisted(() => vi.fn());
const mockMembership = vi.hoisted(() => vi.fn());
const mockRelFindUnique = vi.hoisted(() => vi.fn());
const mockGetUsage = vi.hoisted(() => vi.fn());
const mockGetConversations = vi.hoisted(() => vi.fn());
const mockGetKnowledge = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError();
  },
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/permissions/sub-org-permissions", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getUserSubOrgMembership: mockMembership };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    orgRelationship: { findUnique: mockRelFindUnique },
  },
}));
vi.mock("@/lib/sub-org/get-sub-org-data", () => ({
  getSubOrgUsageStats: mockGetUsage,
  getSubOrgConversations: mockGetConversations,
  getSubOrgKnowledgeBases: mockGetKnowledge,
}));

import SubOrgDashboardPage from "@/app/dashboard/sub-org/[subOrgId]/page";

const params = { subOrgId: "sub_1" };

beforeEach(() => {
  mockAuth.mockReset();
  mockMembership.mockReset();
  mockRelFindUnique.mockReset();
  mockGetUsage.mockReset();
  mockGetConversations.mockReset();
  mockGetKnowledge.mockReset();
});

function findByTestId(node: unknown, testId: string): { props: Record<string, unknown> } | null {
  if (node == null || typeof node !== "object") return null;
  const candidate = node as { props?: Record<string, unknown> };
  const props = candidate.props;
  if (props && (props as Record<string, unknown>)["data-testid"] === testId) {
    return { props };
  }
  if (props) {
    const children = props.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        const hit = findByTestId(child, testId);
        if (hit) return hit;
      }
    } else if (children) {
      const hit = findByTestId(children, testId);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Walk every primitive string/number reachable through .props of a
 * React element tree (children + named props). JSON.stringify can't
 * be used directly because React's runtime wraps elements with
 * back-references that look circular to the JSON encoder.
 */
function collectText(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (typeof node !== "object") return out;
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) {
    for (const value of Object.values(props)) {
      if (Array.isArray(value)) {
        for (const item of value) collectText(item, out);
      } else {
        collectText(value, out);
      }
    }
  }
  return out;
}

function renderedText(node: unknown): string {
  return collectText(node).join("\n");
}

describe("/dashboard/sub-org/[subOrgId]", () => {
  it("redirects to /sign-in when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    await expect(SubOrgDashboardPage({ params })).rejects.toBeInstanceOf(RedirectError);
  });

  it("notFound when caller has no SubOrgMembership", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce(null);
    await expect(SubOrgDashboardPage({ params })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("notFound when the OrgRelationship row is missing", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ id: "mem_1" });
    mockRelFindUnique.mockResolvedValueOnce(null);
    await expect(SubOrgDashboardPage({ params })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("contains no Sprint-19.7.3-followup placeholder text", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ id: "mem_1" });
    mockRelFindUnique.mockResolvedValueOnce({
      id: "sub_1",
      childOrgId: "org_clerk_child",
      subOrgName: "Acme",
      brandColor: null,
    });
    mockGetUsage.mockResolvedValueOnce({
      period: "month",
      since: new Date(),
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      durationMs: 0,
      costUsd: 0,
      conversationCount: 0,
      agentCount: 0,
      workflowCount: 0,
    });
    mockGetConversations.mockResolvedValueOnce([]);
    mockGetKnowledge.mockResolvedValueOnce([]);
    const el = await SubOrgDashboardPage({ params });
    const text = renderedText(el);
    expect(text).not.toMatch(/Sprint 19\.7\.3/);
    expect(text).not.toMatch(/Echte Daten folgen/);
  });

  it("renders stat cards from getSubOrgUsageStats + knowledge count", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ id: "mem_1" });
    mockRelFindUnique.mockResolvedValueOnce({
      id: "sub_1",
      childOrgId: "org_clerk_child",
      subOrgName: "Acme",
      brandColor: null,
    });
    mockGetUsage.mockResolvedValueOnce({
      period: "month",
      since: new Date(),
      llmCalls: 42,
      inputTokens: 1000,
      outputTokens: 500,
      cachedInputTokens: 100,
      durationMs: 9999,
      costUsd: 1.23,
      conversationCount: 12,
      agentCount: 3,
      workflowCount: 2,
    });
    mockGetConversations.mockResolvedValueOnce([]);
    mockGetKnowledge.mockResolvedValueOnce([{ id: "kb1" }, { id: "kb2" }]);

    const el = await SubOrgDashboardPage({ params });
    expect(findByTestId(el, "sub-org-dashboard-stats")).toBeTruthy();

    const text = renderedText(el);
    // 30-day window flag
    expect(text).toContain("Conversations (30T)");
    // values land from getSubOrgUsageStats (12 conversations, 3 agents, 2 workflows)
    expect(text).toMatch(/12/);
    expect(text).toMatch(/Workflows/);
    expect(mockGetUsage).toHaveBeenCalledWith("org_clerk_child", "month");
    expect(mockGetConversations).toHaveBeenCalledWith("org_clerk_child", 5);
  });

  it("shows the empty-state for recent activity when there are no conversations", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ id: "mem_1" });
    mockRelFindUnique.mockResolvedValueOnce({
      id: "sub_1",
      childOrgId: "org_clerk_child",
      subOrgName: "Acme",
      brandColor: null,
    });
    mockGetUsage.mockResolvedValueOnce({
      period: "month",
      since: new Date(),
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      durationMs: 0,
      costUsd: 0,
      conversationCount: 0,
      agentCount: 0,
      workflowCount: 0,
    });
    mockGetConversations.mockResolvedValueOnce([]);
    mockGetKnowledge.mockResolvedValueOnce([]);

    const el = await SubOrgDashboardPage({ params });
    expect(findByTestId(el, "sub-org-dashboard-recent-empty")).toBeTruthy();
    expect(findByTestId(el, "sub-org-dashboard-recent-list")).toBeNull();
  });

  it("renders up to 5 recent conversations from getSubOrgConversations", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockMembership.mockResolvedValueOnce({ id: "mem_1" });
    mockRelFindUnique.mockResolvedValueOnce({
      id: "sub_1",
      childOrgId: "org_clerk_child",
      subOrgName: "Acme",
      brandColor: null,
    });
    mockGetUsage.mockResolvedValueOnce({
      period: "month",
      since: new Date(),
      llmCalls: 1,
      inputTokens: 1,
      outputTokens: 1,
      cachedInputTokens: 0,
      durationMs: 1,
      costUsd: 0,
      conversationCount: 1,
      agentCount: 1,
      workflowCount: 0,
    });
    mockGetConversations.mockResolvedValueOnce([
      {
        id: "c1",
        sessionId: "s1",
        visitorName: "Maria",
        visitorEmail: null,
        leadScore: 80,
        sentiment: null,
        createdAt: new Date("2026-05-12T10:00:00Z"),
        agentName: "Sales Bot",
      },
    ]);
    mockGetKnowledge.mockResolvedValueOnce([]);

    const el = await SubOrgDashboardPage({ params });
    expect(findByTestId(el, "sub-org-dashboard-recent-list")).toBeTruthy();
    const text = renderedText(el);
    expect(text).toContain("Maria");
    expect(text).toContain("Sales Bot");
  });
});
