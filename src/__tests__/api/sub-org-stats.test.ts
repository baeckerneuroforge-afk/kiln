import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * Stats API contract tests — drives requireSubOrgAccess + the
 * parallel-batch aggregation. Prisma is mocked so we don't need a
 * live DB; the test verifies the route's wiring rather than DB
 * behavior.
 */

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    orgRelationship: { findFirst: vi.fn() },
    agent: { count: vi.fn() },
    agentTeam: { count: vi.fn() },
    conversation: { count: vi.fn() },
    auditEvent: { findFirst: vi.fn() },
    subOrgSubscription: { findUnique: vi.fn() },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "@/app/api/agency/sub-orgs/[id]/stats/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(): Request {
  return new Request("http://localhost/api/agency/sub-orgs/rel-1/stats");
}

describe("GET /api/agency/sub-orgs/[id]/stats", () => {
  it("returns 401 when the caller is not signed in", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });
    const res = await GET(makeRequest(), { params: { id: "rel-1" } });
    expect(res.status).toBe(401);
  });

  it("returns 400 when the caller has no active org", async () => {
    authMock.mockResolvedValue({ userId: "u1", orgId: null });
    const res = await GET(makeRequest(), { params: { id: "rel-1" } });
    expect(res.status).toBe(400);
  });

  it("returns 404 (not 403) when the relationship belongs to a different agency", async () => {
    authMock.mockResolvedValue({ userId: "u1", orgId: "org_caller" });
    prismaMock.orgRelationship.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest(), { params: { id: "rel-1" } });
    expect(res.status).toBe(404);
  });

  it("aggregates KPIs and includes MRR for an active subscription", async () => {
    authMock.mockResolvedValue({ userId: "u1", orgId: "org_caller" });
    prismaMock.orgRelationship.findFirst.mockResolvedValue({
      id: "rel-1",
      childOrgId: "org_acme",
      parentOrgId: "org_caller",
    });
    prismaMock.agent.count
      .mockResolvedValueOnce(3) // active
      .mockResolvedValueOnce(5); // total
    prismaMock.agentTeam.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);
    prismaMock.conversation.count.mockResolvedValue(41);
    prismaMock.auditEvent.findFirst.mockResolvedValue({
      createdAt: new Date("2026-05-01T10:00:00Z"),
    });
    prismaMock.subOrgSubscription.findUnique.mockResolvedValue({
      status: "ACTIVE",
      priceAmount: 19_700,
      priceCurrency: "eur",
      priceInterval: "month",
    });

    const res = await GET(makeRequest(), { params: { id: "rel-1" } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      activeAgents: 3,
      totalAgents: 5,
      activeWorkflows: 2,
      totalWorkflows: 3,
      conversations30d: 41,
      mrrCents: 19_700,
      mrrCurrency: "eur",
      subscriptionStatus: "ACTIVE",
    });
    expect(body.lastActivityAt).toBe("2026-05-01T10:00:00.000Z");
  });

  it("zeros MRR when the subscription is canceled", async () => {
    authMock.mockResolvedValue({ userId: "u1", orgId: "org_caller" });
    prismaMock.orgRelationship.findFirst.mockResolvedValue({
      id: "rel-1",
      childOrgId: "org_acme",
      parentOrgId: "org_caller",
    });
    prismaMock.agent.count.mockResolvedValue(0);
    prismaMock.agentTeam.count.mockResolvedValue(0);
    prismaMock.conversation.count.mockResolvedValue(0);
    prismaMock.auditEvent.findFirst.mockResolvedValue(null);
    prismaMock.subOrgSubscription.findUnique.mockResolvedValue({
      status: "CANCELED",
      priceAmount: 19_700,
      priceCurrency: "eur",
      priceInterval: "month",
    });

    const res = await GET(makeRequest(), { params: { id: "rel-1" } });
    const body = await res.json();
    expect(body.mrrCents).toBe(0);
    expect(body.subscriptionStatus).toBe("CANCELED");
  });

  it("returns null lastActivity and zero counts for a fresh sub-org", async () => {
    authMock.mockResolvedValue({ userId: "u1", orgId: "org_caller" });
    prismaMock.orgRelationship.findFirst.mockResolvedValue({
      id: "rel-1",
      childOrgId: "org_acme",
      parentOrgId: "org_caller",
    });
    prismaMock.agent.count.mockResolvedValue(0);
    prismaMock.agentTeam.count.mockResolvedValue(0);
    prismaMock.conversation.count.mockResolvedValue(0);
    prismaMock.auditEvent.findFirst.mockResolvedValue(null);
    prismaMock.subOrgSubscription.findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest(), { params: { id: "rel-1" } });
    const body = await res.json();
    expect(body.activeAgents).toBe(0);
    expect(body.lastActivityAt).toBeNull();
    expect(body.subscriptionStatus).toBeNull();
    expect(body.mrrCents).toBe(0);
  });
});
