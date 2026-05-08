import { auth } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import type {
  ActivityFeedItem,
  CostByCustomer,
  CrossCustomerApproval,
  CustomerHealth,
  CustomerHealthStatus,
  OperationsCustomer,
  OperationsOverview,
  OperationsTimeRange,
  TimeRangeKey,
} from "@/lib/operations/types";

const TOKEN_COST_EUR = 0.00002;
const FRESH_SNAPSHOT_MS = 10 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function authHasOrgRole(value: unknown): value is { orgRole?: string | null } {
  return isRecord(value) && (typeof value.orgRole === "string" || value.orgRole === null || value.orgRole === undefined);
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function estimateTokenCostEur(tokens: number): number {
  return Math.round(tokens * TOKEN_COST_EUR * 100) / 100;
}

export function formatDraftPreview(draft: Prisma.JsonValue | null): string {
  if (!isRecord(draft)) return "Draft awaiting review";
  const body = draft.body;
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 160);
  const response = draft.response;
  if (typeof response === "string" && response.trim()) return response.trim().slice(0, 160);
  const subject = draft.subject;
  if (typeof subject === "string" && subject.trim()) return subject.trim().slice(0, 160);
  return "Draft awaiting review";
}

export function detectApprovalChannel(draft: Prisma.JsonValue | null, triggerPayload: Prisma.JsonValue): CrossCustomerApproval["channel"] {
  if (isRecord(draft) && draft.channel === "EMAIL") return "EMAIL";
  if (isRecord(draft) && draft.channel === "WHATSAPP") return "WHATSAPP";
  if (isRecord(triggerPayload) && triggerPayload.channel === "EMAIL") return "EMAIL";
  if (isRecord(triggerPayload) && triggerPayload.channel === "WHATSAPP") return "WHATSAPP";
  if (isRecord(triggerPayload) && triggerPayload.triggerType === "MANUAL") return "MANUAL";
  return "UNKNOWN";
}

export function calculateHealthStatus(args: {
  approvalsPending: number;
  failedRuns24h: number;
  costEur: number;
  averageCostEur: number;
}): CustomerHealthStatus {
  if (args.failedRuns24h > 0 || args.approvalsPending > 10) return "CRITICAL";
  const costIsHigh = args.averageCostEur > 0 && args.costEur > args.averageCostEur * 1.5;
  if ((args.approvalsPending >= 1 && args.approvalsPending <= 9) || costIsHigh) {
    return "NEEDS_ATTENTION";
  }
  return "HEALTHY";
}

export function resolveTimeRange(searchParams: URLSearchParams): OperationsTimeRange {
  const keyParam = searchParams.get("range");
  const key: TimeRangeKey =
    keyParam === "week" || keyParam === "month" || keyParam === "custom" ? keyParam : "today";

  const now = new Date();
  let start: Date;
  let end = now;

  if (key === "week") {
    start = addDays(startOfDay(now), -6);
  } else if (key === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (key === "custom") {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    start = from ? startOfDay(new Date(from)) : startOfDay(now);
    end = to ? addDays(startOfDay(new Date(to)), 1) : now;
    if (Number.isNaN(start.getTime())) start = startOfDay(now);
    if (Number.isNaN(end.getTime()) || end <= start) end = now;
  } else {
    start = startOfDay(now);
  }

  const duration = Math.max(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
  return {
    key,
    start,
    end,
    previousStart: new Date(start.getTime() - duration),
    previousEnd: start,
  };
}

async function getCustomers(agencyOrgId: string): Promise<OperationsCustomer[]> {
  const relationships = await prisma.orgRelationship.findMany({
    where: {
      parentOrgId: agencyOrgId,
      subOrgStatus: { not: "ARCHIVED" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      childOrgId: true,
      subOrgName: true,
      subOrgStatus: true,
      createdAt: true,
    },
  });
  const orgIds = relationships.map((rel) => rel.childOrgId);
  const branding = orgIds.length === 0
    ? []
    : await prisma.orgBranding.findMany({
        where: { orgId: { in: orgIds } },
        select: { orgId: true, logoUrl: true },
      });
  const logos = new Map(branding.map((brand) => [brand.orgId, brand.logoUrl]));
  return relationships.map((rel) => ({
    relationshipId: rel.id,
    orgId: rel.childOrgId,
    name: rel.subOrgName,
    status: rel.subOrgStatus,
    logoUrl: logos.get(rel.childOrgId) ?? null,
    createdAt: rel.createdAt.toISOString(),
  }));
}

export async function requireOperationsAccess(): Promise<{
  userId: string;
  agencyOrgId: string;
  agencyName: string;
  eligible: boolean;
  reason: "ok" | "not_agency_operator";
  customers: OperationsCustomer[];
  redirectTarget: string | null;
}> {
  let scope;
  try {
    scope = await requireOrgId();
  } catch (err) {
    if (err instanceof OrgContextError || err instanceof Error) {
      throw err;
    }
    throw new Error("Unauthorized");
  }

  const [authResult, customers, branding] = await Promise.all([
    auth(),
    getCustomers(scope.orgId),
    prisma.orgBranding.findUnique({
      where: { orgId: scope.orgId },
      select: { agencyName: true },
    }),
  ]);

  const orgRole = authHasOrgRole(authResult) ? authResult.orgRole ?? null : null;
  const isAgencyOwner = orgRole === "AGENCY_OWNER" || orgRole === "org:admin" || orgRole === "admin";
  const eligible = isAgencyOwner || customers.length >= 2;

  return {
    userId: scope.userId,
    agencyOrgId: scope.orgId,
    agencyName: branding?.agencyName ?? "Agency",
    eligible,
    reason: eligible ? "ok" : "not_agency_operator",
    customers,
    redirectTarget: customers.length === 1 ? `/dashboard/agency/sub-orgs/${customers[0].relationshipId}` : null,
  };
}

async function sumTokensByCustomer(orgIds: string[], range: OperationsTimeRange): Promise<Map<string, number>> {
  if (orgIds.length === 0) return new Map();
  const runLogs = await prisma.departmentRunLog.findMany({
    where: {
      createdAt: { gte: range.start, lt: range.end },
      department: { orgId: { in: orgIds } },
    },
    select: {
      tokensUsed: true,
      department: { select: { orgId: true } },
    },
  });
  const credits = await prisma.aiCreditUsage.groupBy({
    by: ["orgId"],
    where: {
      orgId: { in: orgIds },
      createdAt: { gte: range.start, lt: range.end },
    },
    _sum: { creditsUsed: true },
  });
  const totals = new Map<string, number>();
  for (const log of runLogs) {
    const orgId = log.department.orgId;
    if (!orgId) continue;
    totals.set(orgId, (totals.get(orgId) ?? 0) + log.tokensUsed);
  }
  for (const usage of credits) {
    if (!usage.orgId) continue;
    totals.set(usage.orgId, (totals.get(usage.orgId) ?? 0) + (usage._sum.creditsUsed ?? 0) * 1000);
  }
  return totals;
}

async function getLastActivityByCustomer(orgIds: string[]): Promise<Map<string, string>> {
  if (orgIds.length === 0) return new Map();
  const [departmentLogs, agentRuns] = await Promise.all([
    prisma.departmentRunLog.findMany({
      where: { department: { orgId: { in: orgIds } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        createdAt: true,
        department: { select: { orgId: true } },
      },
    }),
    prisma.agentRun.findMany({
      where: { orgId: { in: orgIds } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { orgId: true, createdAt: true },
    }),
  ]);

  const last = new Map<string, string>();
  for (const log of departmentLogs) {
    const orgId = log.department.orgId;
    if (orgId && !last.has(orgId)) last.set(orgId, log.createdAt.toISOString());
  }
  for (const run of agentRuns) {
    if (!run.orgId) continue;
    const current = last.get(run.orgId);
    if (!current || new Date(run.createdAt) > new Date(current)) {
      last.set(run.orgId, run.createdAt.toISOString());
    }
  }
  return last;
}

export async function buildOperationsOverview(args: {
  agencyOrgId: string;
  agencyName: string;
  customers: OperationsCustomer[];
  range: OperationsTimeRange;
  snapshot?: {
    used: boolean;
    stale: boolean;
    computedAt: string | null;
  };
  eligible?: boolean;
  reason?: "ok" | "not_agency_operator";
  redirectTarget?: string | null;
}): Promise<OperationsOverview> {
  const orgIds = args.customers.map((customer) => customer.orgId);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    activeDepartments,
    pendingByDepartment,
    failedRuns,
    tokensByCustomer,
    revenueAggregate,
    departmentsForPending,
    lastActivity,
  ] = await Promise.all([
    orgIds.length === 0
      ? Promise.resolve([])
      : prisma.department.groupBy({
          by: ["orgId"],
          where: { orgId: { in: orgIds }, status: "ACTIVE" },
          _count: { _all: true },
        }),
    orgIds.length === 0
      ? Promise.resolve([])
      : prisma.departmentBacklogItem.groupBy({
          by: ["departmentId"],
          where: {
            status: "NEEDS_APPROVAL",
            department: { orgId: { in: orgIds } },
          },
          _count: { _all: true },
        }),
    orgIds.length === 0
      ? Promise.resolve([])
      : prisma.agentRun.groupBy({
          by: ["orgId"],
          where: {
            orgId: { in: orgIds },
            status: "ERROR",
            createdAt: { gte: since24h },
          },
          _count: { _all: true },
        }),
    sumTokensByCustomer(orgIds, args.range),
    prisma.subOrgInvoice.aggregate({
      where: {
        parentAgencyOrgId: args.agencyOrgId,
        status: "paid",
        paidAt: { gte: args.range.start, lt: args.range.end },
      },
      _sum: { amount: true },
    }),
    orgIds.length === 0
      ? Promise.resolve([])
      : prisma.department.findMany({
          where: { orgId: { in: orgIds } },
          select: { id: true, orgId: true },
        }),
    getLastActivityByCustomer(orgIds),
  ]);

  const departmentOrgById = new Map(departmentsForPending.map((department) => [department.id, department.orgId]));
  const approvalsByCustomer = new Map<string, number>();
  for (const row of pendingByDepartment) {
    const orgId = departmentOrgById.get(row.departmentId);
    if (!orgId) continue;
    approvalsByCustomer.set(orgId, (approvalsByCustomer.get(orgId) ?? 0) + row._count._all);
  }

  const activeDepartmentCounts = new Map(activeDepartments.map((row) => [row.orgId ?? "", row._count._all]));
  const failedRunsByCustomer = new Map(failedRuns.map((row) => [row.orgId ?? "", row._count._all]));
  const totalCost = Array.from(tokensByCustomer.values()).reduce((sum, tokens) => sum + estimateTokenCostEur(tokens), 0);
  const averageCost = args.customers.length > 0 ? totalCost / args.customers.length : 0;

  const customers: CustomerHealth[] = args.customers.map((customer) => {
    const tokensUsed = tokensByCustomer.get(customer.orgId) ?? 0;
    const costEur = estimateTokenCostEur(tokensUsed);
    const approvalsPending = approvalsByCustomer.get(customer.orgId) ?? 0;
    const failedRuns24h = failedRunsByCustomer.get(customer.orgId) ?? 0;
    const activeDepartmentCount = activeDepartmentCounts.get(customer.orgId) ?? 0;
    return {
      subOrgId: customer.orgId,
      relationshipId: customer.relationshipId,
      name: customer.name,
      logoUrl: customer.logoUrl,
      status: calculateHealthStatus({
        approvalsPending,
        failedRuns24h,
        costEur,
        averageCostEur: averageCost,
      }),
      approvalsPending,
      activeDepartments: activeDepartmentCount,
      failedRuns24h,
      tokensUsed,
      costEur,
      lastActivityAt: lastActivity.get(customer.orgId) ?? null,
      openHref: `/dashboard/agency/sub-orgs/${customer.relationshipId}`,
    };
  });

  const stats = {
    totalCustomers: args.customers.length,
    activeDepartments: customers.reduce((sum, customer) => sum + customer.activeDepartments, 0),
    pendingApprovals: customers.reduce((sum, customer) => sum + customer.approvalsPending, 0),
    failedRuns24h: customers.reduce((sum, customer) => sum + customer.failedRuns24h, 0),
    tokensUsed: Array.from(tokensByCustomer.values()).reduce((sum, tokens) => sum + tokens, 0),
    tokenCostEur: totalCost,
    revenueEur: Math.round(((revenueAggregate._sum.amount ?? 0) / 100) * 100) / 100,
  };

  return {
    eligible: args.eligible ?? true,
    reason: args.reason ?? "ok",
    agencyOrgId: args.agencyOrgId,
    agencyName: args.agencyName,
    timeRange: {
      key: args.range.key,
      start: args.range.start.toISOString(),
      end: args.range.end.toISOString(),
    },
    snapshot: args.snapshot ?? { used: false, stale: false, computedAt: null },
    stats,
    customers,
    redirectTarget: args.redirectTarget ?? null,
  };
}

export async function getFreshSnapshot(agencyOrgId: string): Promise<{
  used: boolean;
  stale: boolean;
  computedAt: string | null;
  topStats: OperationsOverview["stats"] | null;
  customerHealth: CustomerHealth[] | null;
}> {
  const snapshot = await prisma.agencyOpsSnapshot.findFirst({
    where: { agencyOrgId },
    orderBy: { computedAt: "desc" },
  });
  if (!snapshot) return { used: false, stale: false, computedAt: null, topStats: null, customerHealth: null };
  const age = Date.now() - snapshot.computedAt.getTime();
  const fresh = age <= FRESH_SNAPSHOT_MS;
  return {
    used: fresh,
    stale: !fresh,
    computedAt: snapshot.computedAt.toISOString(),
    topStats: fresh
      ? {
          totalCustomers: snapshot.totalCustomers,
          activeDepartments: snapshot.activeDepartments,
          pendingApprovals: snapshot.pendingApprovals,
          failedRuns24h: snapshot.failedRuns24h,
          tokensUsed: snapshot.tokensUsedToday,
          tokenCostEur: estimateTokenCostEur(snapshot.tokensUsedToday),
          revenueEur: snapshot.revenueToday,
        }
      : null,
    customerHealth: fresh && Array.isArray(snapshot.customerHealth)
      ? snapshot.customerHealth.filter(isRecord).map((item) => item as unknown as CustomerHealth)
      : null,
  };
}

export async function createAgencyOpsSnapshot(agencyOrgId: string): Promise<void> {
  const customers = await getCustomers(agencyOrgId);
  const branding = await prisma.orgBranding.findUnique({
    where: { orgId: agencyOrgId },
    select: { agencyName: true },
  });
  const range = resolveTimeRange(new URLSearchParams("range=today"));
  const overview = await buildOperationsOverview({
    agencyOrgId,
    agencyName: branding?.agencyName ?? "Agency",
    customers,
    range,
    snapshot: { used: false, stale: false, computedAt: null },
  });
  await prisma.agencyOpsSnapshot.create({
    data: {
      agencyOrgId,
      totalCustomers: overview.stats.totalCustomers,
      activeDepartments: overview.stats.activeDepartments,
      pendingApprovals: overview.stats.pendingApprovals,
      failedRuns24h: overview.stats.failedRuns24h,
      tokensUsedToday: overview.stats.tokensUsed,
      revenueToday: overview.stats.revenueEur,
      customerHealth: overview.customers as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getCrossCustomerApprovals(limit = 10): Promise<CrossCustomerApproval[]> {
  const access = await requireOperationsAccess();
  if (!access.eligible) return [];
  const orgIds = access.customers.map((customer) => customer.orgId);
  const customerByOrg = new Map(access.customers.map((customer) => [customer.orgId, customer]));
  if (orgIds.length === 0) return [];
  const items = await prisma.departmentBacklogItem.findMany({
    where: {
      status: "NEEDS_APPROVAL",
      department: { orgId: { in: orgIds } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      department: { select: { id: true, name: true, orgId: true } },
    },
  });
  return items.map((item) => {
    const customer = item.department.orgId ? customerByOrg.get(item.department.orgId) : null;
    return {
      id: item.id,
      departmentId: item.department.id,
      departmentName: item.department.name,
      customerName: customer?.name ?? "Unknown customer",
      customerOrgId: item.department.orgId ?? "",
      channel: detectApprovalChannel(item.approvalDraft, item.triggerPayload),
      draftPreview: formatDraftPreview(item.approvalDraft),
      waitMinutes: Math.max(0, Math.floor((Date.now() - item.createdAt.getTime()) / 60000)),
      createdAt: item.createdAt.toISOString(),
      href: `/dashboard/departments/${item.department.id}/approvals`,
    };
  });
}

function describeDecision(decision: Prisma.JsonValue): string {
  if (!isRecord(decision)) return "Department activity recorded";
  const type = decision.type;
  if (typeof type === "string") return type.replaceAll("_", " ").toLowerCase();
  const action = decision.action;
  if (typeof action === "string") return action.replaceAll("_", " ").toLowerCase();
  return "Department activity recorded";
}

export async function getActivityFeed(limit = 20): Promise<ActivityFeedItem[]> {
  const access = await requireOperationsAccess();
  if (!access.eligible) return [];
  const orgIds = access.customers.map((customer) => customer.orgId);
  const customerByOrg = new Map(access.customers.map((customer) => [customer.orgId, customer]));
  if (orgIds.length === 0) return [];
  const logs = await prisma.departmentRunLog.findMany({
    where: { department: { orgId: { in: orgIds } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      department: { select: { id: true, name: true, orgId: true } },
    },
  });
  return logs.map((log) => {
    const customer = log.department.orgId ? customerByOrg.get(log.department.orgId) : null;
    const decision = describeDecision(log.managerDecision);
    const severity: ActivityFeedItem["severity"] = log.invocationType === "ERROR" ? "critical" : decision.includes("approval") ? "warning" : "info";
    return {
      id: log.id,
      customerName: customer?.name ?? "Unknown customer",
      departmentName: log.department.name,
      title: `${customer?.name ?? "Customer"} — ${log.department.name} ${decision}`,
      description: `${log.invocationType} ${log.workerInvoked ? `via ${log.workerInvoked}` : "run"} · ${log.durationMs}ms`,
      timestamp: log.createdAt.toISOString(),
      href: `/dashboard/departments/${log.department.id}`,
      severity,
    };
  });
}

export async function getCostByCustomer(range: OperationsTimeRange): Promise<CostByCustomer[]> {
  const access = await requireOperationsAccess();
  if (!access.eligible) return [];
  const orgIds = access.customers.map((customer) => customer.orgId);
  const [current, previous] = await Promise.all([
    sumTokensByCustomer(orgIds, range),
    sumTokensByCustomer(orgIds, {
      ...range,
      start: range.previousStart,
      end: range.previousEnd,
    }),
  ]);
  return access.customers
    .map((customer) => {
      const tokens = current.get(customer.orgId) ?? 0;
      const previousTokens = previous.get(customer.orgId) ?? 0;
      const diff = tokens - previousTokens;
      const trendPercent = previousTokens > 0 ? Math.round((diff / previousTokens) * 100) : tokens > 0 ? 100 : 0;
      return {
        subOrgId: customer.orgId,
        customerName: customer.name,
        tokens,
        costEur: estimateTokenCostEur(tokens),
        trend: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
        trendPercent: Math.abs(trendPercent),
      } satisfies CostByCustomer;
    })
    .sort((a, b) => b.costEur - a.costEur)
    .slice(0, 10);
}
