import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockRequireOrgId = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  orgRelationship: { findMany: vi.fn() },
  orgBranding: { findMany: vi.fn(), findUnique: vi.fn() },
  department: { groupBy: vi.fn(), findMany: vi.fn() },
  departmentBacklogItem: { groupBy: vi.fn(), findMany: vi.fn() },
  agentRun: { groupBy: vi.fn(), findMany: vi.fn() },
  departmentRunLog: { findMany: vi.fn() },
  aiCreditUsage: { groupBy: vi.fn() },
  subOrgInvoice: { aggregate: vi.fn() },
  agencyOpsSnapshot: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/org-context", () => ({
  requireOrgId: mockRequireOrgId,
  OrgContextError: class OrgContextError extends Error {},
}));

import {
  buildOperationsOverview,
  calculateHealthStatus,
  detectApprovalChannel,
  estimateTokenCostEur,
  formatDraftPreview,
  getCostByCustomer,
  requireOperationsAccess,
  resolveTimeRange,
} from "@/lib/operations/aggregation";
import type { OperationsCustomer, OperationsTimeRange } from "@/lib/operations/types";

function resetPrismaMocks(): void {
  for (const model of Object.values(mockPrisma)) {
    for (const fn of Object.values(model)) {
      fn.mockReset();
    }
  }
}

function makeRange(): OperationsTimeRange {
  return {
    key: "today",
    start: new Date("2026-05-08T00:00:00Z"),
    end: new Date("2026-05-09T00:00:00Z"),
    previousStart: new Date("2026-05-07T00:00:00Z"),
    previousEnd: new Date("2026-05-08T00:00:00Z"),
  };
}

function makeCustomers(): OperationsCustomer[] {
  return [
    {
      relationshipId: "rel_1",
      orgId: "org_child_1",
      name: "Praxis Dr. Schmidt",
      status: "ACTIVE",
      logoUrl: null,
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    {
      relationshipId: "rel_2",
      orgId: "org_child_2",
      name: "Auto Mayer",
      status: "ACTIVE",
      logoUrl: null,
      createdAt: "2026-05-02T00:00:00.000Z",
    },
  ];
}

beforeEach(() => {
  vi.useRealTimers();
  resetPrismaMocks();
  mockAuth.mockReset();
  mockRequireOrgId.mockReset();
});

describe("operations aggregation helpers", () => {
  it("classifies healthy customers when approvals, failures, and spend are normal", () => {
    expect(calculateHealthStatus({ approvalsPending: 0, failedRuns24h: 0, costEur: 10, averageCostEur: 10 })).toBe("HEALTHY");
  });

  it("classifies failed runs as critical", () => {
    expect(calculateHealthStatus({ approvalsPending: 0, failedRuns24h: 1, costEur: 10, averageCostEur: 10 })).toBe("CRITICAL");
  });

  it("classifies more than ten approvals as critical", () => {
    expect(calculateHealthStatus({ approvalsPending: 11, failedRuns24h: 0, costEur: 10, averageCostEur: 10 })).toBe("CRITICAL");
  });

  it("classifies one to nine approvals as needing attention", () => {
    expect(calculateHealthStatus({ approvalsPending: 4, failedRuns24h: 0, costEur: 10, averageCostEur: 10 })).toBe("NEEDS_ATTENTION");
  });

  it("classifies cost above 150 percent of average as needing attention", () => {
    expect(calculateHealthStatus({ approvalsPending: 0, failedRuns24h: 0, costEur: 16, averageCostEur: 10 })).toBe("NEEDS_ATTENTION");
  });

  it("formats draft previews from body, response, and fallback", () => {
    expect(formatDraftPreview({ body: "Hello customer" })).toBe("Hello customer");
    expect(formatDraftPreview({ response: "Draft response" })).toBe("Draft response");
    expect(formatDraftPreview({})).toBe("Draft awaiting review");
  });

  it("detects approval channel from draft first, then trigger payload", () => {
    expect(detectApprovalChannel({ channel: "EMAIL" }, { channel: "WHATSAPP" })).toBe("EMAIL");
    expect(detectApprovalChannel(null, { channel: "WHATSAPP" })).toBe("WHATSAPP");
    expect(detectApprovalChannel(null, { triggerType: "MANUAL" })).toBe("MANUAL");
  });

  it("estimates token cost in euros", () => {
    expect(estimateTokenCostEur(1_200_000)).toBe(24);
  });

  it("resolves custom ranges with inclusive end date", () => {
    const range = resolveTimeRange(new URLSearchParams("range=custom&from=2026-05-01&to=2026-05-03"));
    expect(range.key).toBe("custom");
    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(4);
    expect(range.start.getDate()).toBe(1);
    expect(range.end.getFullYear()).toBe(2026);
    expect(range.end.getMonth()).toBe(4);
    expect(range.end.getDate()).toBe(4);
  });
});

describe("operations access and overview aggregation", () => {
  it("allows agency owners even with a single sub-org", async () => {
    mockRequireOrgId.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockAuth.mockResolvedValueOnce({ orgRole: "AGENCY_OWNER" });
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([
      { id: "rel_1", childOrgId: "org_child_1", subOrgName: "Solo", subOrgStatus: "ACTIVE", createdAt: new Date("2026-05-01") },
    ]);
    mockPrisma.orgBranding.findMany.mockResolvedValueOnce([]);
    mockPrisma.orgBranding.findUnique.mockResolvedValueOnce({ agencyName: "Hephaistos Systems" });

    const access = await requireOperationsAccess();
    expect(access.eligible).toBe(true);
    expect(access.customers).toHaveLength(1);
  });

  it("marks non-owner single-sub-org users ineligible with redirect target", async () => {
    mockRequireOrgId.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockAuth.mockResolvedValueOnce({ orgRole: "org:member" });
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([
      { id: "rel_1", childOrgId: "org_child_1", subOrgName: "Solo", subOrgStatus: "ACTIVE", createdAt: new Date("2026-05-01") },
    ]);
    mockPrisma.orgBranding.findMany.mockResolvedValueOnce([]);
    mockPrisma.orgBranding.findUnique.mockResolvedValueOnce(null);

    const access = await requireOperationsAccess();
    expect(access.eligible).toBe(false);
    expect(access.redirectTarget).toBe("/dashboard/agency/sub-orgs/rel_1");
  });

  it("builds customer health and top stats from departments, approvals, failures, tokens, and revenue", async () => {
    mockPrisma.department.groupBy.mockResolvedValueOnce([{ orgId: "org_child_1", _count: { _all: 2 } }]);
    mockPrisma.departmentBacklogItem.groupBy.mockResolvedValueOnce([{ departmentId: "dept_1", _count: { _all: 3 } }]);
    mockPrisma.agentRun.groupBy.mockResolvedValueOnce([{ orgId: "org_child_2", _count: { _all: 1 } }]);
    mockPrisma.departmentRunLog.findMany
      .mockResolvedValueOnce([
        { tokensUsed: 100_000, department: { orgId: "org_child_1" } },
        { tokensUsed: 50_000, department: { orgId: "org_child_2" } },
      ])
      .mockResolvedValueOnce([
        { createdAt: new Date("2026-05-08T10:00:00Z"), department: { orgId: "org_child_1" } },
      ]);
    mockPrisma.aiCreditUsage.groupBy.mockResolvedValueOnce([]);
    mockPrisma.subOrgInvoice.aggregate.mockResolvedValueOnce({ _sum: { amount: 489100 } });
    mockPrisma.department.findMany.mockResolvedValueOnce([
      { id: "dept_1", orgId: "org_child_1" },
      { id: "dept_2", orgId: "org_child_2" },
    ]);
    mockPrisma.agentRun.findMany.mockResolvedValueOnce([
      { orgId: "org_child_2", createdAt: new Date("2026-05-08T11:00:00Z") },
    ]);

    const overview = await buildOperationsOverview({
      agencyOrgId: "org_agency",
      agencyName: "Hephaistos Systems",
      customers: makeCustomers(),
      range: makeRange(),
    });

    expect(overview.stats).toMatchObject({
      totalCustomers: 2,
      activeDepartments: 2,
      pendingApprovals: 3,
      failedRuns24h: 1,
      tokensUsed: 150_000,
      revenueEur: 4891,
    });
    expect(overview.customers[0]).toMatchObject({ status: "NEEDS_ATTENTION", approvalsPending: 3 });
    expect(overview.customers[1]).toMatchObject({ status: "CRITICAL", failedRuns24h: 1 });
  });

  it("returns top customer costs sorted by current period cost", async () => {
    mockRequireOrgId.mockResolvedValueOnce({ userId: "user_1", orgId: "org_agency" });
    mockAuth.mockResolvedValueOnce({ orgRole: "AGENCY_OWNER" });
    mockPrisma.orgRelationship.findMany.mockResolvedValueOnce([
      { id: "rel_1", childOrgId: "org_child_1", subOrgName: "A", subOrgStatus: "ACTIVE", createdAt: new Date("2026-05-01") },
      { id: "rel_2", childOrgId: "org_child_2", subOrgName: "B", subOrgStatus: "ACTIVE", createdAt: new Date("2026-05-02") },
    ]);
    mockPrisma.orgBranding.findMany.mockResolvedValueOnce([]);
    mockPrisma.orgBranding.findUnique.mockResolvedValueOnce(null);
    mockPrisma.departmentRunLog.findMany
      .mockResolvedValueOnce([{ tokensUsed: 200_000, department: { orgId: "org_child_2" } }])
      .mockResolvedValueOnce([{ tokensUsed: 100_000, department: { orgId: "org_child_2" } }]);
    mockPrisma.aiCreditUsage.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const costs = await getCostByCustomer(makeRange());
    expect(costs[0]).toMatchObject({ customerName: "B", tokens: 200_000, trend: "up", trendPercent: 100 });
  });
});
