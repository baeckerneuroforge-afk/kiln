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
  Area,
  AreaChart,
} from "recharts";
import {
  Coins,
  Cpu,
  Loader2,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface AgentCostSummary {
  agentId: string;
  agentName: string;
  creditsUsed: number;
  totalCostCents: number;
  callCount: number;
  budgetCapCredits: number | null;
  percentUsed: number | null;
}

interface CostDashboardData {
  totalCreditsUsed: number;
  totalCostCents: number;
  totalCalls: number;
  planCredits: { balance: number; total: number };
  byModel: Record<string, { calls: number; creditsUsed: number; costCents: number; inputTokens: number; outputTokens: number }>;
  byAgent: AgentCostSummary[];
  dailyCredits: { date: string; credits: number; costCents: number }[];
  savings: {
    actualCostCents: number;
    hypotheticalOpusCostCents: number;
    savedCents: number;
    savedPercent: number;
  };
}

const AGENT_COLORS = ["#F97316", "#3B82F6", "#22C55E", "#A855F7", "#EF4444", "#06B6D4", "#F59E0B", "#EC4899"];

function formatEuro(cents: number): string {
  if (cents < 1) return `€${(cents / 100).toFixed(4)}`;
  return `€${(cents / 100).toFixed(2)}`;
}

function shortModelName(id: string): string {
  const map: Record<string, string> = {
    "claude-opus-4-6": "Opus 4.6",
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-haiku-4-5-20251001": "Haiku 4.5",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "sonar-pro": "Sonar Pro",
    "gemini-2.0-pro": "Gemini Pro",
    "gemini-2.0-flash": "Gemini Flash",
  };
  return map[id] || id;
}

interface CostDashboardProps {
  className?: string;
}

export function CostDashboard({ className }: CostDashboardProps) {
  const [data, setData] = useState<CostDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/cost-overview");
      if (res.ok) setData(await res.json());
    } catch {
      // Silence
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (!data || data.totalCalls === 0) return null;

  const models = Object.entries(data.byModel);
  const modelChartData = models
    .map(([id, stats]) => ({
      name: shortModelName(id),
      credits: stats.creditsUsed,
      costCents: Math.round(stats.costCents * 100) / 100,
      fill: "#F97316",
    }))
    .sort((a, b) => b.credits - a.credits);

  const trendData = (data.dailyCredits || []).map((d) => ({
    date: new Date(d.date).toLocaleDateString("de-DE", { day: "numeric", month: "short" }),
    credits: d.credits,
    cost: Math.round(d.costCents) / 100,
  }));

  const planPercentUsed = data.planCredits.total > 0
    ? Math.round(((data.planCredits.total - data.planCredits.balance) / data.planCredits.total) * 100)
    : 0;

  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Credits Used */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Credits verbraucht</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {data.totalCreditsUsed}
                  <span className="text-sm text-muted-foreground ml-1">/ {data.planCredits.total}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.totalCalls} Aufrufe · {formatEuro(data.totalCostCents)} API-Kosten
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
                <Coins className="h-4 w-4 text-orange-400" />
              </div>
            </div>
            {/* Plan credits progress bar */}
            <div className="mt-3 h-1.5 rounded-full bg-zinc-800">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  planPercentUsed > 80 ? "bg-red-500" : planPercentUsed > 50 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.min(100, planPercentUsed)}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Modelle genutzt</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{models.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Verschiedene LLMs aktiv</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10">
                <Cpu className="h-4 w-4 text-violet-400" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">Smart Routing Savings</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-400">{data.savings.savedPercent}%</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatEuro(data.savings.savedCents)} gespart vs Opus-only
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
                <TrendingDown className="h-4 w-4 text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Credits Trend + Model Breakdown */}
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Daily Credits Trend */}
          {trendData.length > 1 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm font-medium text-foreground mb-4">Credit-Verbrauch (30 Tage)</p>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="creditGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#71717a" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#71717a" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tickFormatter={(v) => `${v} Cr`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#1c1917",
                        border: "1px solid #27272a",
                        borderRadius: 12,
                        fontSize: 11,
                        padding: "8px 10px",
                      }}
                      labelStyle={{ color: "#a1a1aa" }}
                      /* eslint-disable @typescript-eslint/no-explicit-any */
                      formatter={((value: any, name: any) => {
                        if (name === "credits") return [`${value} Credits`, "Credits"];
                        return [`€${Number(value).toFixed(2)}`, "API-Kosten"];
                      }) as any}
                      /* eslint-enable @typescript-eslint/no-explicit-any */
                    />
                    <Area
                      type="monotone"
                      dataKey="credits"
                      stroke="#F97316"
                      strokeWidth={2}
                      fill="url(#creditGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Model Credit Breakdown */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground mb-4">Credits nach Modell</p>
            {modelChartData.length > 0 && (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelChartData} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#A1A1AA", fontSize: 10 }}
                      tickFormatter={(v) => `${v} Cr`}
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
                      }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={((value: any) => [`${Number(value)} Credits`, "Credits"]) as any}
                    />
                    <Bar dataKey="credits" radius={[0, 8, 8, 0]}>
                      {modelChartData.map((_, i) => (
                        <Cell key={i} fill={AGENT_COLORS[i % AGENT_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Per-Agent Credit Utilization */}
        {data.byAgent.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="h-4 w-4 text-amber-400" />
              <p className="text-sm font-medium text-foreground">Credit-Verbrauch pro Agent</p>
            </div>
            <div className="space-y-3">
              {data.byAgent.map((agent, i) => (
                <div key={agent.agentId} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: AGENT_COLORS[i % AGENT_COLORS.length] }}
                      />
                      <span className="text-xs font-medium text-foreground truncate max-w-[180px]">{agent.agentName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{agent.callCount} Aufrufe</span>
                      <span className="font-medium text-orange-400">{agent.creditsUsed} Credits</span>
                      <span className="text-zinc-600">{formatEuro(agent.totalCostCents)}</span>
                    </div>
                  </div>
                  {agent.percentUsed !== null && (
                    <div className="h-1.5 rounded-full bg-zinc-800">
                      <div
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          agent.percentUsed > 80 ? "bg-red-500" : agent.percentUsed > 50 ? "bg-amber-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${Math.min(100, agent.percentUsed)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
