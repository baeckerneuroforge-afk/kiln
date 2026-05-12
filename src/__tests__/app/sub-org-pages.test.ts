/**
 * Sprint 19.7.3 — server-component tests for the nine
 * /dashboard/sub-org/[subOrgId]/* pages.
 *
 * Each page follows the same template:
 *   1. await getSubOrgContext(params.subOrgId)
 *   2. notFound() if null OR if the relevant permission is missing
 *   3. fetch data via get-sub-org-data
 *   4. return JSX with either a list or an empty-state
 *
 * We test:
 *   - notFound() when context is null
 *   - notFound() when permission is missing (for permission-gated pages)
 *   - returns a renderable element on success
 *   - empty-state vs list paths exercised at least once across pages
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

class NotFoundError extends Error {
  constructor() { super("__notFound__"); }
}

const mockGetSubOrgContext = vi.hoisted(() => vi.fn());
const mockGetSubOrgAgents = vi.hoisted(() => vi.fn());
const mockGetSubOrgWorkflows = vi.hoisted(() => vi.fn());
const mockGetSubOrgKnowledgeBases = vi.hoisted(() => vi.fn());
const mockGetSubOrgConversations = vi.hoisted(() => vi.fn());
const mockGetSubOrgCustomers = vi.hoisted(() => vi.fn());
const mockGetSubOrgUsageStats = vi.hoisted(() => vi.fn());
const mockGetSubOrgMemberships = vi.hoisted(() => vi.fn());
const mockUserFindMany = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: () => { throw new NotFoundError(); },
}));
vi.mock("@/lib/sub-org/get-sub-org-context", () => ({
  getSubOrgContext: mockGetSubOrgContext,
}));
vi.mock("@/lib/sub-org/get-sub-org-data", () => ({
  getSubOrgAgents: mockGetSubOrgAgents,
  getSubOrgWorkflows: mockGetSubOrgWorkflows,
  getSubOrgKnowledgeBases: mockGetSubOrgKnowledgeBases,
  getSubOrgConversations: mockGetSubOrgConversations,
  getSubOrgCustomers: mockGetSubOrgCustomers,
  getSubOrgUsageStats: mockGetSubOrgUsageStats,
  getSubOrgMemberships: mockGetSubOrgMemberships,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: mockUserFindMany } },
}));

import AgentsPage from "@/app/dashboard/sub-org/[subOrgId]/agents/page";
import WorkflowsPage from "@/app/dashboard/sub-org/[subOrgId]/workflows/page";
import KnowledgePage from "@/app/dashboard/sub-org/[subOrgId]/knowledge/page";
import ConversationsPage from "@/app/dashboard/sub-org/[subOrgId]/conversations/page";
import CustomersPage from "@/app/dashboard/sub-org/[subOrgId]/customers/page";
import AnalyticsPage from "@/app/dashboard/sub-org/[subOrgId]/analytics/page";
import IntegrationsPage from "@/app/dashboard/sub-org/[subOrgId]/integrations/page";
import MembershipsPage from "@/app/dashboard/sub-org/[subOrgId]/memberships/page";
import SettingsPage from "@/app/dashboard/sub-org/[subOrgId]/settings/page";

function makeContext(permissions: string[], overrides: Record<string, unknown> = {}) {
  return {
    userId: "user_1",
    subOrg: {
      id: "sub_1",
      childOrgId: "org_clerk_child_1",
      parentOrgId: "org_clerk_parent_1",
      subOrgName: "Acme",
      subOrgStatus: "ACTIVE",
      brandColor: null,
      logoUrl: null,
      industry: null,
      ...((overrides.subOrg as Record<string, unknown>) ?? {}),
    },
    clerkOrgId: "org_clerk_child_1",
    membership: {
      id: "mem_1",
      subOrgId: "sub_1",
      userId: "user_1",
      role: "MEMBER",
      permissionSet: "READ_ONLY",
    },
    permissions: new Set(permissions),
  };
}

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(NotFoundError);
}

beforeEach(() => {
  mockGetSubOrgContext.mockReset();
  mockGetSubOrgAgents.mockReset();
  mockGetSubOrgWorkflows.mockReset();
  mockGetSubOrgKnowledgeBases.mockReset();
  mockGetSubOrgConversations.mockReset();
  mockGetSubOrgCustomers.mockReset();
  mockGetSubOrgUsageStats.mockReset();
  mockGetSubOrgMemberships.mockReset();
  mockUserFindMany.mockReset();
});

const params = { subOrgId: "sub_1" };

describe("/dashboard/sub-org/[id]/agents", () => {
  it("notFound when context is null", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(null);
    await expectNotFound(AgentsPage({ params }));
  });

  it("notFound when caller lacks agents.read", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["conversations.read"]));
    await expectNotFound(AgentsPage({ params }));
  });

  it("renders empty state when there are no agents", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["agents.read"]));
    mockGetSubOrgAgents.mockResolvedValueOnce([]);
    const el = (await AgentsPage({ params })) as { props: unknown };
    expect(el).toBeTruthy();
    expect(mockGetSubOrgAgents).toHaveBeenCalledWith("org_clerk_child_1");
  });

  it("renders the agent list when there are agents", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["agents.read", "agents.write"]));
    mockGetSubOrgAgents.mockResolvedValueOnce([
      { id: "a1", name: "Sales Bot", slug: "sales", status: "ACTIVE", llmModel: "claude", createdAt: new Date() },
    ]);
    const el = await AgentsPage({ params });
    expect(el).toBeTruthy();
  });
});

describe("/dashboard/sub-org/[id]/workflows", () => {
  it("notFound when context is null", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(null);
    await expectNotFound(WorkflowsPage({ params }));
  });

  it("notFound when caller lacks agents.read", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["conversations.read"]));
    await expectNotFound(WorkflowsPage({ params }));
  });

  it("renders for callers with agents.read", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["agents.read"]));
    mockGetSubOrgWorkflows.mockResolvedValueOnce([]);
    const el = await WorkflowsPage({ params });
    expect(el).toBeTruthy();
  });
});

describe("/dashboard/sub-org/[id]/knowledge", () => {
  it("notFound when context is null", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(null);
    await expectNotFound(KnowledgePage({ params }));
  });

  it("notFound for callers with only agents.read (no knowledge.read)", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["agents.read"]));
    await expectNotFound(KnowledgePage({ params }));
  });

  it("renders for callers with knowledge.read", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["knowledge.read"]));
    mockGetSubOrgKnowledgeBases.mockResolvedValueOnce([]);
    const el = await KnowledgePage({ params });
    expect(el).toBeTruthy();
  });
});

describe("/dashboard/sub-org/[id]/conversations", () => {
  it("notFound when context is null", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(null);
    await expectNotFound(ConversationsPage({ params }));
  });

  it("renders for READ_ONLY callers (conversations.read in baseline)", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["conversations.read"]));
    mockGetSubOrgConversations.mockResolvedValueOnce([]);
    const el = await ConversationsPage({ params });
    expect(el).toBeTruthy();
  });

  it("fetches up to 50 conversations", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["conversations.read"]));
    mockGetSubOrgConversations.mockResolvedValueOnce([]);
    await ConversationsPage({ params });
    expect(mockGetSubOrgConversations).toHaveBeenCalledWith("org_clerk_child_1", 50);
  });
});

describe("/dashboard/sub-org/[id]/customers", () => {
  it("notFound when context is null", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(null);
    await expectNotFound(CustomersPage({ params }));
  });

  it("renders when allowed", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["conversations.read"]));
    mockGetSubOrgCustomers.mockResolvedValueOnce([]);
    const el = await CustomersPage({ params });
    expect(el).toBeTruthy();
  });
});

describe("/dashboard/sub-org/[id]/analytics", () => {
  it("notFound when context is null", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(null);
    await expectNotFound(AnalyticsPage({ params }));
  });

  it("renders the stat cards on success", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["analytics.read"]));
    mockGetSubOrgUsageStats.mockResolvedValueOnce({
      period: "week", since: new Date(), llmCalls: 0, inputTokens: 0, outputTokens: 0,
      cachedInputTokens: 0, durationMs: 0, costUsd: 0, conversationCount: 0,
      agentCount: 0, workflowCount: 0,
    });
    const el = await AnalyticsPage({ params });
    expect(el).toBeTruthy();
  });
});

describe("/dashboard/sub-org/[id]/integrations", () => {
  it("notFound when context is null", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(null);
    await expectNotFound(IntegrationsPage({ params }));
  });

  it("notFound when caller lacks integrations.read", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext([]));
    await expectNotFound(IntegrationsPage({ params }));
  });

  it("renders the IntegrationsTabs shell when caller has integrations.read", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["integrations.read"]));
    const el = await IntegrationsPage({ params });
    expect(el).toBeTruthy();
  });
});

describe("/dashboard/sub-org/[id]/memberships", () => {
  it("notFound when context is null", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(null);
    await expectNotFound(MembershipsPage({ params }));
  });

  it("renders with an empty membership list", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext([]));
    mockGetSubOrgMemberships.mockResolvedValueOnce([]);
    const el = await MembershipsPage({ params });
    expect(el).toBeTruthy();
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("enriches member rows with cached User emails when present", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext([]));
    mockGetSubOrgMemberships.mockResolvedValueOnce([
      { id: "m1", userId: "user_a", role: "MEMBER", permissionSet: "READ_ONLY", invitedAt: null, acceptedAt: new Date(), createdAt: new Date() },
    ]);
    mockUserFindMany.mockResolvedValueOnce([
      { id: "user_a", email: "a@example.com", firstName: "Alice", lastName: null },
    ]);
    const el = await MembershipsPage({ params });
    expect(el).toBeTruthy();
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["user_a"] } } }),
    );
  });
});

describe("/dashboard/sub-org/[id]/settings", () => {
  it("notFound when context is null", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(null);
    await expectNotFound(SettingsPage({ params }));
  });

  it("renders for any permission level (no gate)", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext([]));
    const el = await SettingsPage({ params });
    expect(el).toBeTruthy();
  });

  it("renders for FULL_ACCESS (memberships.manage surfaces Edit CTA)", async () => {
    mockGetSubOrgContext.mockResolvedValueOnce(makeContext(["memberships.manage"]));
    const el = await SettingsPage({ params });
    expect(el).toBeTruthy();
  });
});
