"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Plus, RefreshCw } from "lucide-react";
import { ActivityFeed } from "@/components/operations/activity-feed";
import { ApprovalsCrossQueue } from "@/components/operations/approvals-cross-queue";
import { CostByCustomerChart } from "@/components/operations/cost-by-customer-chart";
import { CustomerHealthGrid } from "@/components/operations/customer-health-grid";
import { OpsEmptyState } from "@/components/operations/ops-empty-state";
import { StatsRow } from "@/components/operations/stats-row";
import { TimeRangeSelector } from "@/components/operations/time-range-selector";
import { Button, buttonVariants } from "@/components/ui/button";
import type {
  ActivityFeedItem,
  CostByCustomer,
  CrossCustomerApproval,
  OperationsOverview,
  TimeRangeKey,
} from "@/lib/operations/types";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : "Request failed";
    throw new Error(message);
  }
  return body as T;
}

function loadingOverview(): OperationsOverview {
  return {
    eligible: true,
    reason: "ok",
    agencyOrgId: "",
    agencyName: "Agency",
    timeRange: { key: "today", start: new Date().toISOString(), end: new Date().toISOString() },
    snapshot: { used: false, stale: false, computedAt: null },
    stats: {
      totalCustomers: 0,
      activeDepartments: 0,
      pendingApprovals: 0,
      failedRuns24h: 0,
      tokensUsed: 0,
      tokenCostEur: 0,
      revenueEur: 0,
    },
    customers: [],
    redirectTarget: null,
  };
}

export function OperationsDashboardView() {
  const [range, setRange] = useState<TimeRangeKey>("today");
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [approvals, setApprovals] = useState<CrossCustomerApproval[]>([]);
  const [events, setEvents] = useState<ActivityFeedItem[]>([]);
  const [costs, setCosts] = useState<CostByCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => `range=${range}`, [range]);

  const loadOperations = useCallback(async (showLoader: boolean) => {
    if (showLoader) setLoading(true);
    setRefreshing(!showLoader);
    try {
      const [nextOverview, nextApprovals, nextEvents, nextCosts] = await Promise.all([
        fetchJson<OperationsOverview>(`/api/operations/overview?${query}`),
        fetchJson<{ approvals: CrossCustomerApproval[] }>("/api/operations/approvals?limit=10"),
        fetchJson<{ events: ActivityFeedItem[] }>("/api/operations/activity-feed?limit=20"),
        fetchJson<{ customers: CostByCustomer[] }>(`/api/operations/cost-by-customer?${query}`),
      ]);
      setOverview(nextOverview);
      setApprovals(nextApprovals.approvals);
      setEvents(nextEvents.events);
      setCosts(nextCosts.customers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operations center");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    loadOperations(true);
  }, [loadOperations]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadOperations(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadOperations]);

  if (loading && !overview) {
    const skeleton = loadingOverview();
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading operations center
        </div>
        <StatsRow stats={skeleton.stats} />
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-44 rounded-lg border border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (overview && !overview.eligible) {
    return <OpsEmptyState redirectTarget={overview.redirectTarget} />;
  }

  const data = overview ?? loadingOverview();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">Agency</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{data.agencyName}</h1>
          <p className="mt-2 text-muted-foreground">Operations cockpit across all customers, departments, approvals, activity, and cost.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TimeRangeSelector value={range} onChange={setRange} />
          <Link href="/dashboard/onboarding" className={buttonVariants()}>
            <Plus className="h-4 w-4" />
            Add Customer
          </Link>
          <Button variant="outline" onClick={() => loadOperations(false)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {data.snapshot.stale && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Snapshot is older than 10 minutes. Showing live values while the next cron refresh catches up.
        </div>
      )}

      <StatsRow stats={data.stats} />
      <CustomerHealthGrid customers={data.customers} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <ApprovalsCrossQueue approvals={approvals} />
        <ActivityFeed events={events} />
      </div>

      <CostByCustomerChart data={costs} />
    </div>
  );
}
