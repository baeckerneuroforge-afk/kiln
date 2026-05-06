/**
 * Smoke tests for /api/analytics/overview — the dashboard-home stats
 * endpoint. Pins the agency metrics (mrr, activeSubOrgs, newSubOrgs30d,
 * stripeConnectStatus, setupFees30d, pendingOnboardings) plus the
 * existing agent metrics.
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
  subOrgInvoice: { aggregate: vi.fn() },
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

// Sensible defaults for every Prisma fn so each test only has to
// override the call(s) it cares about.
function resetMocks(): void {
  mockRequireOrgId.mockReset();
  mockPrisma.agent.findMany.mockReset().mockResolvedValue([]);
  mockPrisma.conversation.count.mockReset().mockResolvedValue(0);
  mockPrisma.agentAnalytics.aggregate
    .mockReset()
    .mockResolvedValue({ _sum: { estimatedValue: 0 } });
  mockPrisma.subOrgSubscription.findMany.mockReset().mockResolvedValue([]);
  mockPrisma.subOrgInvoice.aggregate
    .mockReset()
    .mockResolvedValue({ _sum: { amount: 0 } });
  mockPrisma.orgRelationship.count.mockReset().mockResolvedValue(0);
  mockPrisma.agencyStripeAccount.findUnique.mockReset().mockResolvedValue(null);
}

beforeEach(resetMocks);

describe("GET /api/analytics/overview", () => {
  it("zeroes when caller has no agents and no agency rows", async () => {
    mockRequireOrgId.mockResolvedValueOnce({
      userId: "u1",
      orgId: "org_1",
    });

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
      setupFees30d: 0,
      pendingOnboardings: 0,
    });
  });

  it("aggregates MRR with monthly + yearly subs (yearly = price/12)", async () => {
    mockRequireOrgId.mockResolvedValueOnce({
      userId: "u_agency",
      orgId: "org_agency",
    });
    mockPrisma.subOrgSubscription.findMany
      // First call: parallel-batch MRR aggregate.
      .mockResolvedValueOnce([
        { priceAmount: 9900, priceInterval: "month" },
        { priceAmount: 2500, priceInterval: "month" },
        { priceAmount: 120000, priceInterval: "year" },
      ])
      // Second call: serial pendingOnboardings active-subscription set.
      .mockResolvedValueOnce([{ subOrgId: "child_org_1" }]);
    mockPrisma.orgRelationship.count
      .mockResolvedValueOnce(3) // activeSubOrgs
      .mockResolvedValueOnce(1) // newSubOrgs30d
      .mockResolvedValueOnce(2); // pendingOnboardings
    mockPrisma.agencyStripeAccount.findUnique.mockResolvedValueOnce({
      onboardingComplete: true,
    });

    const body = await (await overviewGET()).json();
    expect(body.mrr).toBe(22400);
    expect(body.activeSubOrgs).toBe(3);
    expect(body.newSubOrgs30d).toBe(1);
    expect(body.pendingOnboardings).toBe(2);
    expect(body.stripeConnectStatus).toBe("active");
  });

  it("connect status: pending when account exists but onboarding incomplete", async () => {
    mockRequireOrgId.mockResolvedValueOnce({
      userId: "u",
      orgId: "org_x",
    });
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
    mockPrisma.conversation.count
      .mockResolvedValueOnce(35) // conversations
      .mockResolvedValueOnce(12); // leads
    mockPrisma.agentAnalytics.aggregate.mockResolvedValueOnce({
      _sum: { estimatedValue: 4500 },
    });

    const body = await (await overviewGET()).json();
    expect(body).toMatchObject({
      agents: 3,
      conversations: 35,
      leads: 12,
      estimatedValue: 4500,
    });
  });

  it("setupFees30d aggregates paid SETUP_FEE invoices in the window", async () => {
    mockRequireOrgId.mockResolvedValueOnce({
      userId: "u",
      orgId: "org_x",
    });
    mockPrisma.subOrgInvoice.aggregate.mockResolvedValueOnce({
      _sum: { amount: 49000 }, // €490
    });

    const body = await (await overviewGET()).json();
    expect(body.setupFees30d).toBe(49000);
  });
});
