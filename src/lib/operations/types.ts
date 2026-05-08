export type TimeRangeKey = "today" | "week" | "month" | "custom";

export type CustomerHealthStatus = "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL";

export interface OperationsTimeRange {
  key: TimeRangeKey;
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

export interface OperationsCustomer {
  relationshipId: string;
  orgId: string;
  name: string;
  status: string;
  logoUrl: string | null;
  createdAt: string;
}

export interface CustomerHealth {
  subOrgId: string;
  relationshipId: string;
  name: string;
  logoUrl: string | null;
  status: CustomerHealthStatus;
  approvalsPending: number;
  activeDepartments: number;
  failedRuns24h: number;
  tokensUsed: number;
  costEur: number;
  lastActivityAt: string | null;
  openHref: string;
}

export interface OperationsOverview {
  eligible: boolean;
  reason: "ok" | "not_agency_operator";
  agencyOrgId: string;
  agencyName: string;
  timeRange: {
    key: TimeRangeKey;
    start: string;
    end: string;
  };
  snapshot: {
    used: boolean;
    stale: boolean;
    computedAt: string | null;
  };
  stats: {
    totalCustomers: number;
    activeDepartments: number;
    pendingApprovals: number;
    failedRuns24h: number;
    tokensUsed: number;
    tokenCostEur: number;
    revenueEur: number;
  };
  customers: CustomerHealth[];
  redirectTarget: string | null;
}

export interface CrossCustomerApproval {
  id: string;
  departmentId: string;
  departmentName: string;
  customerName: string;
  customerOrgId: string;
  channel: "EMAIL" | "WHATSAPP" | "MANUAL" | "UNKNOWN";
  draftPreview: string;
  waitMinutes: number;
  createdAt: string;
  href: string;
}

export interface ActivityFeedItem {
  id: string;
  customerName: string;
  departmentName: string;
  title: string;
  description: string;
  timestamp: string;
  href: string;
  severity: "info" | "success" | "warning" | "critical";
}

export interface CostByCustomer {
  subOrgId: string;
  customerName: string;
  tokens: number;
  costEur: number;
  trend: "up" | "down" | "flat";
  trendPercent: number;
}
