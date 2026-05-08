import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBuildOperationsOverview = vi.hoisted(() => vi.fn());
const mockGetFreshSnapshot = vi.hoisted(() => vi.fn());
const mockRequireOperationsAccess = vi.hoisted(() => vi.fn());
const mockResolveTimeRange = vi.hoisted(() => vi.fn());
const mockGetCrossCustomerApprovals = vi.hoisted(() => vi.fn());
const mockGetActivityFeed = vi.hoisted(() => vi.fn());
const mockGetCostByCustomer = vi.hoisted(() => vi.fn());

vi.mock("@/lib/operations/aggregation", () => ({
  buildOperationsOverview: mockBuildOperationsOverview,
  getFreshSnapshot: mockGetFreshSnapshot,
  requireOperationsAccess: mockRequireOperationsAccess,
  resolveTimeRange: mockResolveTimeRange,
  getCrossCustomerApprovals: mockGetCrossCustomerApprovals,
  getActivityFeed: mockGetActivityFeed,
  getCostByCustomer: mockGetCostByCustomer,
}));

import { GET as overviewGET } from "@/app/api/operations/overview/route";
import { GET as approvalsGET } from "@/app/api/operations/approvals/route";
import { GET as activityGET } from "@/app/api/operations/activity-feed/route";
import { GET as costGET } from "@/app/api/operations/cost-by-customer/route";

const range = {
  key: "today",
  start: new Date("2026-05-08T00:00:00Z"),
  end: new Date("2026-05-09T00:00:00Z"),
  previousStart: new Date("2026-05-07T00:00:00Z"),
  previousEnd: new Date("2026-05-08T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveTimeRange.mockReturnValue(range);
});

describe("operations API routes", () => {
  it("overview returns fresh snapshot without recomputing", async () => {
    mockRequireOperationsAccess.mockResolvedValueOnce({
      eligible: true,
      reason: "ok",
      agencyOrgId: "org_agency",
      agencyName: "Hephaistos Systems",
      customers: [],
      redirectTarget: null,
    });
    mockGetFreshSnapshot.mockResolvedValueOnce({
      used: true,
      stale: false,
      computedAt: "2026-05-08T12:00:00.000Z",
      topStats: {
        totalCustomers: 2,
        activeDepartments: 4,
        pendingApprovals: 1,
        failedRuns24h: 0,
        tokensUsed: 1000,
        tokenCostEur: 0.02,
        revenueEur: 100,
      },
      customerHealth: [],
    });

    const res = await overviewGET(new Request("https://x.test/api/operations/overview?range=today"));
    const body = await res.json();
    expect(body.snapshot.used).toBe(true);
    expect(mockBuildOperationsOverview).not.toHaveBeenCalled();
  });

  it("overview returns ineligible payload for single-customer non-operators", async () => {
    mockRequireOperationsAccess.mockResolvedValueOnce({
      eligible: false,
      reason: "not_agency_operator",
      agencyOrgId: "org_agency",
      agencyName: "Agency",
      customers: [{ relationshipId: "rel_1", orgId: "org_child", name: "Solo" }],
      redirectTarget: "/dashboard/agency/sub-orgs/rel_1",
    });

    const res = await overviewGET(new Request("https://x.test/api/operations/overview"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.eligible).toBe(false);
    expect(body.redirectTarget).toBe("/dashboard/agency/sub-orgs/rel_1");
  });

  it("approvals endpoint respects limit", async () => {
    mockGetCrossCustomerApprovals.mockResolvedValueOnce([{ id: "item_1" }]);
    const body = await (await approvalsGET(new Request("https://x.test/api/operations/approvals?limit=7"))).json();
    expect(mockGetCrossCustomerApprovals).toHaveBeenCalledWith(7);
    expect(body.approvals).toEqual([{ id: "item_1" }]);
  });

  it("activity endpoint respects limit", async () => {
    mockGetActivityFeed.mockResolvedValueOnce([{ id: "event_1" }]);
    const body = await (await activityGET(new Request("https://x.test/api/operations/activity-feed?limit=12"))).json();
    expect(mockGetActivityFeed).toHaveBeenCalledWith(12);
    expect(body.events).toEqual([{ id: "event_1" }]);
  });

  it("cost endpoint resolves the requested time range", async () => {
    mockGetCostByCustomer.mockResolvedValueOnce([{ subOrgId: "org_child_1" }]);
    const body = await (await costGET(new Request("https://x.test/api/operations/cost-by-customer?range=week"))).json();
    expect(mockResolveTimeRange).toHaveBeenCalled();
    expect(mockGetCostByCustomer).toHaveBeenCalledWith(range);
    expect(body.customers).toEqual([{ subOrgId: "org_child_1" }]);
  });
});
