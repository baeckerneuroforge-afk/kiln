"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Coins, Database, Key, Layers3, PiggyBank, Router, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LlmUsageData {
  summary: {
    totalCostUsd: number;
    totalSavedUsd: number;
    totalNaiveCostUsd: number;
    savingsPercent: number;
    totalCalls: number;
    cacheHitRate: number;
    byokCalls: number;
    poolCalls: number;
  };
  daily: Array<{ date: string; costUsd: number; savedUsd: number }>;
  topDepartments: Array<{ id: string | null; name: string; calls: number; costUsd: number; savedUsd: number }>;
  topWorkers: Array<{ id: string | null; name: string; calls: number; costUsd: number; savedUsd: number }>;
  providers: Array<{ provider: string; calls: number }>;
}

export default function LlmUsagePage() {
  const [data, setData] = useState<LlmUsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/llm-usage")
      .then((response) => response.json())
      .then((payload) => setData(payload))
      .finally(() => setLoading(false));
  }, []);

  const maxDaily = useMemo(() => {
    if (!data?.daily.length) return 1;
    return Math.max(...data.daily.map((day) => day.costUsd + day.savedUsd), 1);
  }, [data]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading LLM usage</div>;
  }

  if (!data) {
    return <div className="text-sm text-muted-foreground">No LLM usage found</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">LLM Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">30-day provider cost, routing and savings overview.</p>
        </div>
        <Button variant="outline" onClick={() => window.location.assign("/dashboard/settings?tab=api-keys")}>
          <Key className="mr-2 h-4 w-4" />
          API Keys
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric icon={Coins} label="Actual Cost" value={formatUsd(data.summary.totalCostUsd)} />
        <Metric icon={PiggyBank} label="Saved" value={formatUsd(data.summary.totalSavedUsd)} tone="green" />
        <Metric icon={Router} label="Naive Cost" value={formatUsd(data.summary.totalNaiveCostUsd)} />
        <Metric icon={Zap} label="Savings" value={`${data.summary.savingsPercent}%`} tone="amber" />
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">Cost Trend</h2>
          <span className="text-xs text-muted-foreground">{data.summary.totalCalls} calls</span>
        </div>
        <div className="flex h-48 items-end gap-1">
          {data.daily.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">No usage in the last 30 days</div>
          ) : data.daily.map((day) => {
            const actualHeight = Math.max(2, (day.costUsd / maxDaily) * 100);
            const savedHeight = Math.max(0, (day.savedUsd / maxDaily) * 100);
            return (
              <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${day.date}: ${formatUsd(day.costUsd)} actual, ${formatUsd(day.savedUsd)} saved`}>
                <div className="flex h-40 w-full max-w-5 flex-col justify-end overflow-hidden rounded-sm bg-muted">
                  <div className="bg-emerald-500/70" style={{ height: `${savedHeight}%` }} />
                  <div className="bg-sky-500/80" style={{ height: `${actualHeight}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown
          title="Top Departments"
          icon={Layers3}
          rows={data.topDepartments.map((item) => ({
            label: item.name,
            detail: `${item.calls} calls`,
            value: formatUsd(item.costUsd),
            subvalue: `${formatUsd(item.savedUsd)} saved`,
          }))}
        />
        <Breakdown
          title="Top Workers"
          icon={Activity}
          rows={data.topWorkers.map((item) => ({
            label: item.name,
            detail: `${item.calls} calls`,
            value: formatUsd(item.costUsd),
            subvalue: `${formatUsd(item.savedUsd)} saved`,
          }))}
        />
        <Breakdown
          title="Routing Mix"
          icon={Database}
          rows={[
            { label: "Cache hit-rate", detail: "Response cache", value: `${data.summary.cacheHitRate}%` },
            { label: "BYOK calls", detail: "Customer keys", value: String(data.summary.byokCalls) },
            { label: "Pool calls", detail: "KILN provider pool", value: String(data.summary.poolCalls) },
            ...data.providers.map((item) => ({
              label: item.provider,
              detail: "Provider",
              value: String(item.calls),
            })),
          ]}
        />
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "blue",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: "blue" | "green" | "amber";
}) {
  const color = tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-sky-600";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-4 w-4 ${color}`} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Breakdown({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: React.ElementType;
  rows: Array<{ label: string; detail: string; value: string; subvalue?: string }>;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-medium text-foreground">{title}</h2>
      </div>
      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : rows.map((row) => (
          <div key={`${row.label}-${row.detail}`} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.detail}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{row.value}</p>
              {row.subvalue ? <p className="text-xs text-emerald-600">{row.subvalue}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
