/**
 * Smoke tests for /api/analytics/overview — the dashboard-home stats
 * endpoint. Pins the new agency metrics (mrr, activeSubOrgs,
 * newSubOrgs30d, stripeConnectStatus) plus the existing agent metrics.
 *
 * Mocks Clerk auth + the org-context helper + Prisma. Stripe SDK is not
 * touched by this endpoint.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireOrgId = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agent: { findMany: vi.fn() },
  conversation: { count: vi.fn() },
  agentAnalytics: { aggregate: vi.fn() },
  subOrgSubscription: { findMany: vi.fn() },
  orgRelationship: { count: vi.fn() },
  agencyStripeAccount: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/org-context", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/org-context")
  >("@/lib/auth/org-context");
  return { ...actual, requireOrgId: mockRequireOrgId };
});

import { GET as overviewGET } from "@/app/api/analytics/overview/route";

beforeEach(() => {
  mockRequireOrgId.mockReset();
  mockPrisma.agent.findMany.mockReset();
  mockPrisma.conversation.count.mockReset();
  mockPrisma.agentAnalytics.aggregate.mockReset();
  mockPrisma.subOrgSubscription.findMany.mockReset();
  mockPrisma.orgRelationship.count.mockReset();
  mockPrisma.agencyStripeAccount.findUnique.mockReset();
});

describe("GET /api/analytics/overview", () => {
  it("zeroes when caller has no agents and no agency rows", async () => {
    mockRequireOrgId.mockResolvedValueOnce({
      userId: "u1",
      orgId: "org_1",
    });
    mockPrisma.agent.findMany.mockResolvedValueOnce([]);
    mockPrisma.subOrgSubscription.findMany.mockResolvedValueOnce([]);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.agencyStripeAccount.findUnique.mockResolvedValueOnce(null);

    const res = await overviewGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      agents: 0,
      conversations: 0,
      leads: 0,
      estimatedValue: 0,
      mrr: 0,
      activeSubOrgs: 0,
      newSubOrgs30d: 0,
      stripeConnectStatus: "not_onboarded",
    });
  });

  it("aggregates MRR with monthly + yearly subs (yearly = price/12)", async () => {
    mockRequireOrgId.mockResolvedValueOnce({
      userId: "u_agency",
      orgId: "org_agency",
    });
    mockPrisma.agent.findMany.mockResolvedValueOnce([]);
    mockPrisma.subOrgSubscription.findMany.mockResolvedValueOnce([
      // €99/mo + €25/mo = €124/mo
      { priceAmount: 9900, priceInterval: "month" },
      { priceAmount: 2500, priceInterval: "month" },
      // €1200/yr → €100/mo
      { priceAmount: 120000, priceInterval: "year" },
    ]);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(3);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(1);
    mockPrisma.agencyStripeAccount.findUnique.mockResolvedValueOnce({
      onboardingComplete: true,
    });

    const res = await overviewGET();
    const body = await res.json();
    // 9900 + 2500 + Math.round(120000/12) = 9900 + 2500 + 10000 = 22400 cents
    expect(body.mrr).toBe(22400);
    expect(body.activeSubOrgs).toBe(3);
    expect(body.newSubOrgs30d).toBe(1);
    expect(body.stripeConnectStatus).toBe("active");
  });

  it("connect status: pending when account exists but onboarding incomplete", async () => {
    mockRequireOrgId.mockResolvedValueOnce({
      userId: "u",
      orgId: "org_x",
    });
    mockPrisma.agent.findMany.mockResolvedValueOnce([]);
    mockPrisma.subOrgSubscription.findMany.mockResolvedValueOnce([]);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.agencyStripeAccount.findUnique.mockResolvedValueOnce({
      onboardingComplete: false,
    });

    const body = await (await overviewGET()).json();
    expect(body.stripeConnectStatus).toBe("pending");
  });

  it("counts agent + conversation + lead metrics in scope", async () => {
    mockRequireOrgId.mockResolvedValueOnce({
      userId: "u",
      orgId: "org_x",
    });
    mockPrisma.agent.findMany.mockResolvedValueOnce([
      { id: "ag_1" },
      { id: "ag_2" },
      { id: "ag_3" },
    ]);
    // First .count() is conversations (35), second is leads (12).
    mockPrisma.conversation.count.mockResolvedValueOnce(35);
    mockPrisma.conversation.count.mockResolvedValueOnce(12);
    mockPrisma.agentAnalytics.aggregate.mockResolvedValueOnce({
      _sum: { estimatedValue: 4500 },
    });
    mockPrisma.subOrgSubscription.findMany.mockResolvedValueOnce([]);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.orgRelationship.count.mockResolvedValueOnce(0);
    mockPrisma.agencyStripeAccount.findUnique.mockResolvedValueOnce(null);

    const body = await (await overviewGET()).json();
    expect(body).toMatchObject({
      agents: 3,
      conversations: 35,
      leads: 12,
      estimatedValue: 4500,
    });
  });
});
