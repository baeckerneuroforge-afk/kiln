"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Cpu,
  GitFork,
  Loader2,
  TrendingDown,
} from "lucide-react";

interface ModelBreakdown {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

interface ModelAnalyticsData {
  realtime: {
    totalCalls: number;
    totalCost: number;
    byModel: Record<string, { calls: number; cost: number }>;
  };
  monthly: {
    byModel: Record<string, ModelBreakdown>;
    totalCost: number;
    totalCalls: number;
    savings: number;
    hypotheticalOpusCost: number;
  };
  parallel: {
    totalExecutions: number;
  };
}

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-6": "#A855F7",
  "claude-sonnet-4-6": "#F97316",
  "claude-haiku-4-5-20251001": "#22C55E",
  "gpt-4.1": "#3B82F6",
  "gpt-4.1-mini": "#06B6D4",
  "sonar-pro": "#EF4444",
};
const FALLBACK_COLOR = "#71717A";

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(tokens);
}

function shortModelName(id: string): string {
  const map: Record<string, string> = {
    "claude-opus-4-6": "Opus 4.6",
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-haiku-4-5-20251001": "Haiku 4.5",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1m",
    "sonar-pro": "Sonar Pro",
  };
  return map[id] || id;
}

export function ModelAnalyticsSection() {
  const [data, setData] = useState<ModelAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/model-analytics");
      if (res.ok) setData(await res.json());
    } catch {
      // Silence — section is additive
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (!data || data.monthly.totalCalls === 0) return null;

  const models = Object.entries(data.monthly.byModel);
  const chartData = models
    .map(([id, stats]) => ({
      name: shortModelName(id),
      cost: Number(stats.cost.toFixed(4)),
      calls: stats.calls,
      fill: MODEL_COLORS[id] || FALLBACK_COLOR,
    }))
    .sort((a, b) => b.cost - a.cost);

  const savingsPercent =
    data.monthly.hypotheticalOpusCost > 0
      ? Math.round(
          ((data.monthly.hypotheticalOpusCost - data.monthly.totalCost) /
            data.monthly.hypotheticalOpusCost) *
            100
        )
      : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr,1fr]">
      {/* Model Usage Breakdown */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Model Usage (30d)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.monthly.totalCalls} calls across {models.length} models
            </p>
          </div>
          <Cpu className="h-4 w-4 text-violet-400" />
        </div>

        {chartData.length > 0 && (
          <div className="mt-4 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#A1A1AA", fontSize: 10 }}
                  tickFormatter={(v) => formatCost(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#A1A1AA", fontSize: 10 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "#111111",
                    color: "#F5F5F5",
                    fontSize: 11,
                    padding: "8px 10px",
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((value: any) => [formatCost(Number(value)), "Cost"]) as any}
                />
                <Bar dataKey="cost" radius={[0, 8, 8, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Model detail list */}
        <div className="mt-4 space-y-2">
          {models.map(([id, stats]) => (
            <div key={id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: MODEL_COLORS[id] || FALLBACK_COLOR }}
                />
                <span className="text-zinc-300">{shortModelName(id)}</span>
              </div>
              <div className="flex items-center gap-4 text-zinc-500">
                <span>{stats.calls} calls</span>
                <span>{formatTokens(stats.tokensIn + stats.tokensOut)} tok</span>
                <span className="text-zinc-300 font-medium">{formatCost(stats.cost)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Savings + Parallel Stats */}
      <div className="space-y-4">
        {/* Cost Savings */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-300">Smart Routing Savings</p>
              <p className="mt-1 text-xs text-zinc-500">
                vs. running everything on Opus
              </p>
            </div>
            <TrendingDown className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-4 flex items-end gap-4">
            <p className="text-4xl font-bold tracking-tight text-emerald-400">
              {savingsPercent}%
            </p>
            <div className="pb-1 text-xs text-zinc-500">
              <p>{formatCost(data.monthly.savings)} saved this month</p>
              <p className="mt-0.5">
                Actual: {formatCost(data.monthly.totalCost)} · Opus-only: {formatCost(data.monthly.hypotheticalOpusCost)}
              </p>
            </div>
          </div>
          {/* Visual bar */}
          <div className="mt-4 space-y-2">
            <div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                <span>Smart Routing</span>
                <span>{formatCost(data.monthly.totalCost)}</span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800">
                <div
                  className="h-2 rounded-full bg-emerald-500"
                  style={{
                    width: `${data.monthly.hypotheticalOpusCost > 0 ? Math.min((data.monthly.totalCost / data.monthly.hypotheticalOpusCost) * 100, 100) : 100}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                <span>All Opus (hypothetical)</span>
                <span>{formatCost(data.monthly.hypotheticalOpusCost)}</span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800">
                <div className="h-2 rounded-full bg-zinc-600 w-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Parallel Execution Metrics */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Parallel Execution</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Agent swarm and parallel branch runs (30d)
              </p>
            </div>
            <GitFork className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-4 flex items-end gap-3">
            <p className="text-3xl font-bold tracking-tight text-foreground">
              {data.parallel.totalExecutions}
            </p>
            <p className="pb-1 text-xs text-muted-foreground">parallel executions</p>
          </div>
          <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
            <p className="text-[10px] text-zinc-500">
              Parallel execution enables agent swarms and fan-out/fan-in workflows to process
              sub-tasks concurrently, reducing total execution time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
