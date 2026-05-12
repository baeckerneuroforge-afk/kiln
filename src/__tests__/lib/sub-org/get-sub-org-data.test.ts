/**
 * Sprint 19.7.3 — read-side fetchers in get-sub-org-data.
 *
 * All helpers filter Prisma by `{ orgId: clerkOrgId }`. The tests
 * assert the filter shape rather than the response — that's the
 * scoping property we want to lock in.
 */
import { describe, expect, it, vi } from "vitest";
import {
  getSubOrgAgents,
  getSubOrgConversations,
  getSubOrgCustomers,
  getSubOrgKnowledgeBases,
  getSubOrgMemberships,
  getSubOrgUsageStats,
  getSubOrgWorkflows,
  periodToSince,
} from "@/lib/sub-org/get-sub-org-data";

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    agent: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    agentTeam: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    conversation: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    knowledgeBase: { findMany: vi.fn().mockResolvedValue([]) },
    customerProfile: { findMany: vi.fn().mockResolvedValue([]) },
    llmUsage: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, durationMs: 0, costUsd: 0 },
        _count: 0,
      }),
    },
    subOrgMembership: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as Parameters<typeof getSubOrgAgents>[1];
}

describe("get-sub-org-data fetchers (filter scoping)", () => {
  it("getSubOrgAgents filters by orgId", async () => {
    const prisma = makePrisma();
    await getSubOrgAgents("org_clerk_42", prisma);
    expect((prisma as never as { agent: { findMany: { mock: { calls: unknown[][] } } } }).agent.findMany.mock.calls[0][0]).toMatchObject({
      where: { orgId: "org_clerk_42" },
    });
  });

  it("getSubOrgWorkflows queries agentTeam scoped by orgId and maps memberCount", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "t1", name: "Sales", status: "ACTIVE", createdAt: new Date(), _count: { members: 3 } },
    ]);
    const prisma = makePrisma({ agentTeam: { findMany, count: vi.fn() } });
    const out = await getSubOrgWorkflows("org_clerk_42", prisma);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { orgId: "org_clerk_42" } });
    expect(out[0].memberCount).toBe(3);
  });

  it("getSubOrgConversations honors the limit and scopes by orgId", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma({ conversation: { findMany, count: vi.fn() } });
    await getSubOrgConversations("org_clerk_42", 25, prisma);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { orgId: "org_clerk_42" },
      take: 25,
    });
  });

  it("getSubOrgKnowledgeBases filters by orgId", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma({ knowledgeBase: { findMany } });
    await getSubOrgKnowledgeBases("org_clerk_42", prisma);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { orgId: "org_clerk_42" } });
  });

  it("getSubOrgCustomers filters by orgId and orders by lastSeenAt desc", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma({ customerProfile: { findMany } });
    await getSubOrgCustomers("org_clerk_42", 10, prisma);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { orgId: "org_clerk_42" },
      orderBy: { lastSeenAt: "desc" },
      take: 10,
    });
  });

  it("getSubOrgMemberships filters by subOrgId (not the Clerk org id)", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma({ subOrgMembership: { findMany } });
    await getSubOrgMemberships("sub_relationship_cuid", prisma);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { subOrgId: "sub_relationship_cuid" } });
  });

  it("periodToSince produces a date roughly N days ago", () => {
    const now = new Date("2026-05-12T12:00:00Z");
    expect(periodToSince("day", now).getTime()).toBe(now.getTime() - 24 * 60 * 60 * 1000);
    expect(periodToSince("week", now).getTime()).toBe(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(periodToSince("month", now).getTime()).toBe(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  });

  it("getSubOrgUsageStats aggregates from LlmUsage and counts entities by orgId", async () => {
    const aggregate = vi.fn().mockResolvedValue({
      _sum: {
        inputTokens: 1000,
        outputTokens: 500,
        cachedInputTokens: 250,
        durationMs: 12000,
        costUsd: 0.42,
      },
      _count: 5,
    });
    const conversationCount = vi.fn().mockResolvedValue(8);
    const agentCount = vi.fn().mockResolvedValue(3);
    const teamCount = vi.fn().mockResolvedValue(2);
    const prisma = makePrisma({
      llmUsage: { aggregate },
      conversation: { findMany: vi.fn(), count: conversationCount },
      agent: { findMany: vi.fn(), count: agentCount },
      agentTeam: { findMany: vi.fn(), count: teamCount },
    });
    const stats = await getSubOrgUsageStats("org_clerk_42", "week", prisma);
    expect(stats.llmCalls).toBe(5);
    expect(stats.inputTokens).toBe(1000);
    expect(stats.outputTokens).toBe(500);
    expect(stats.costUsd).toBeCloseTo(0.42);
    expect(stats.conversationCount).toBe(8);
    expect(stats.agentCount).toBe(3);
    expect(stats.workflowCount).toBe(2);
    expect(aggregate.mock.calls[0][0].where).toMatchObject({ orgId: "org_clerk_42" });
  });
});
