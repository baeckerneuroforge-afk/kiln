"use client";

import { AlertTriangle, Building2, CheckSquare, CircleDollarSign, Network, Zap } from "lucide-react";
import type { OperationsOverview } from "@/lib/operations/types";
import { cn } from "@/lib/utils";

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function StatCard({
  label,
  value,
  meta,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  meta: string;
  tone?: "default" | "warning" | "critical" | "success";
  icon: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-sm",
        tone === "warning" && "border-amber-500/40 bg-amber-500/5",
        tone === "critical" && "border-red-500/40 bg-red-500/5",
        tone === "success" && "border-emerald-500/30 bg-emerald-500/5"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground",
            tone === "warning" && "bg-amber-500/15 text-amber-400",
            tone === "critical" && "bg-red-500/15 text-red-400",
            tone === "success" && "bg-emerald-500/15 text-emerald-400"
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        {tone === "warning" && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
    </div>
  );
}

export function StatsRow({ stats }: { stats: OperationsOverview["stats"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <StatCard
        label="Total Customers"
        value={String(stats.totalCustomers)}
        meta="Active sub-orgs"
        icon={<Building2 className="h-4 w-4" />}
      />
      <StatCard
        label="Active Departments"
        value={String(stats.activeDepartments)}
        meta="Running teams"
        icon={<Network className="h-4 w-4" />}
        tone="success"
      />
      <StatCard
        label="Pending Approvals"
        value={String(stats.pendingApprovals)}
        meta="Across customers"
        icon={<CheckSquare className="h-4 w-4" />}
        tone={stats.pendingApprovals > 5 ? "warning" : "default"}
      />
      <StatCard
        label="Failed Runs (24h)"
        value={String(stats.failedRuns24h)}
        meta="Needs review"
        icon={<AlertTriangle className="h-4 w-4" />}
        tone={stats.failedRuns24h > 0 ? "critical" : "default"}
      />
      <StatCard
        label="Tokens Used"
        value={formatCompactNumber(stats.tokensUsed)}
        meta={`${formatEuro(stats.tokenCostEur)} estimated`}
        icon={<Zap className="h-4 w-4" />}
      />
      <StatCard
        label="Revenue"
        value={formatEuro(stats.revenueEur)}
        meta="Selected period"
        icon={<CircleDollarSign className="h-4 w-4" />}
      />
    </div>
  );
}
