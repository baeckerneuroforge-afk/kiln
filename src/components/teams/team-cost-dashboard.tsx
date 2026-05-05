"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  Calculator,
  Coins,
  Cpu,
  Loader2,
  ShieldAlert,
  TrendingDown,
  Zap,
} from "lucide-react";

interface AgentCostBreakdown {
  agentId: string;
  agentName: string;
  model: string;
  modelLabel: string;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  executionCount: number;
  avgTokensIn: number;
  avgTokensOut: number;
  costPerExecution: number;
}

interface CostData {
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  executionCount: number;
  costPerExecution: number;
  singleAgentEquivalent: number;
  savingsPercent: number;
  fallbackCostThisMonth: number;
  fallbackActivationsThisMonth: number;
  agentBreakdown: AgentCostBreakdown[];
  modelsUsed: { model: string; label: string; inputPer1M: number; outputPer1M: number }[];
}

interface TeamCostDashboardProps {
  teamId: string;
}

const AGENT_COLORS = ["#F97316", "#3B82F6", "#22C55E", "#A855F7", "#EF4444", "#06B6D4", "#F59E0B", "#EC4899"];

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

export function TeamCostDashboard({ teamId }: TeamCostDashboardProps) {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCost = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}/cost`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadCost();
  }, [loadCost]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
      </div>
    );
  }

  if (!data || data.executionCount === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center max-w-2xl mx-auto">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <Coins className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-foreground">No cost data yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Run your team to start tracking token usage and costs.
        </p>
      </div>
    );
  }

  const chartData = data.agentBreakdown.map((agent, i) => ({
    name: agent.agentName.length > 16 ? agent.agentName.slice(0, 14) + "..." : agent.agentName,
    cost: Number(agent.totalCost.toFixed(4)),
    fill: AGENT_COLORS[i % AGENT_COLORS.length],
  }));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Cost</p>
              <p className="mt-1.5 text-2xl font-semibold text-foreground">{formatCost(data.totalCost)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{data.executionCount} executions</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
              <Coins className="h-4.5 w-4.5 text-orange-400" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Cost / Execution</p>
              <p className="mt-1.5 text-2xl font-semibold text-foreground">{formatCost(data.costPerExecution)}</p>
              <p className="mt-1 text-xs text-muted-foreground">avg per run</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <Calculator className="h-4.5 w-4.5 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Tokens</p>
              <p className="mt-1.5 text-2xl font-semibold text-foreground">
                {formatTokens(data.totalTokensIn + data.totalTokensOut)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatTokens(data.totalTokensIn)} in / {formatTokens(data.totalTokensOut)} out
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10">
              <Cpu className="h-4.5 w-4.5 text-violet-400" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">Workflow Savings</p>
              <p className="mt-1.5 text-2xl font-semibold text-emerald-400">{data.savingsPercent}%</p>
              <p className="mt-1 text-xs text-muted-foreground">
                vs single Opus agent ({formatCost(data.singleAgentEquivalent)})
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <TrendingDown className="h-4.5 w-4.5 text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-amber-300/80">
                Fallback Cost
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-amber-300">
                {formatCost(data.fallbackCostThisMonth)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.fallbackActivationsThisMonth} activations this month
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
              <ShieldAlert className="h-4.5 w-4.5 text-amber-300" />
            </div>
          </div>
        </div>
      </div>

      {/* Cost Projection + Agent Breakdown */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Agent Cost Chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h4 className="text-sm font-semibold text-foreground mb-4">Cost per Agent</h4>
          {chartData.length > 0 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#262626" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#A1A1AA", fontSize: 11 }}
                    tickFormatter={(v) => formatCost(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#A1A1AA", fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "#111111",
                      color: "#F5F5F5",
                    }}
                    formatter={(value) => [formatCost(Number(value)), "Cost"]}
                  />
                  <Bar dataKey="cost" radius={[0, 8, 8, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={entry.name} fill={AGENT_COLORS[i % AGENT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>

        {/* Cost Projections */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h4 className="text-sm font-semibold text-foreground mb-4">Monthly Cost Projection</h4>
          <div className="space-y-3">
            {[100, 500, 1000, 5000].map((volume) => {
              const teamCost = data.costPerExecution * volume;
              const singleCost = (data.singleAgentEquivalent / Math.max(data.executionCount, 1)) * volume;
              return (
                <div key={volume} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                  <div className="w-28 shrink-0">
                    <p className="text-xs font-medium text-foreground">{volume.toLocaleString()} runs/mo</p>
                  </div>
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground">Team</span>
                        <span className="text-xs font-medium text-foreground">{formatCost(teamCost)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-orange-500"
                          style={{ width: `${singleCost > 0 ? Math.min((teamCost / singleCost) * 100, 100) : 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground">Single Opus</span>
                        <span className="text-xs font-medium text-muted-foreground">{formatCost(singleCost)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-muted w-full" />
                      </div>
                    </div>
                  </div>
                  <div className="w-12 text-right">
                    <span className="flex items-center justify-end gap-0.5 text-xs font-medium text-emerald-400">
                      <ArrowDown className="h-3 w-3" />
                      {singleCost > 0 ? Math.round((1 - teamCost / singleCost) * 100) : 0}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Agent Detail Table */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-4">Per-Agent Breakdown</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Agent</th>
                <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Model</th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Executions</th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Avg Tokens</th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Cost/Exec</th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.agentBreakdown.map((agent, i) => (
                <tr key={agent.agentId} className="border-b border-border/50">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: AGENT_COLORS[i % AGENT_COLORS.length] }}
                      />
                      <span className="text-foreground font-medium truncate max-w-[140px]">{agent.agentName}</span>
                    </div>
                  </td>
                  <td className="py-2.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {agent.modelLabel}
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-muted-foreground">{agent.executionCount}</td>
                  <td className="py-2.5 text-right text-muted-foreground">
                    {formatTokens(agent.avgTokensIn + agent.avgTokensOut)}
                  </td>
                  <td className="py-2.5 text-right text-foreground">{formatCost(agent.costPerExecution)}</td>
                  <td className="py-2.5 text-right font-medium text-foreground">{formatCost(agent.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Pricing Reference */}
      {data.modelsUsed.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-amber-400" />
            <h4 className="text-sm font-semibold text-foreground">Models Used</h4>
          </div>
          <div className="flex flex-wrap gap-3">
            {data.modelsUsed.map((m) => (
              <div key={m.model} className="rounded-lg border border-border bg-background/60 px-3 py-2">
                <p className="text-xs font-medium text-foreground">{m.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  ${m.inputPer1M}/M in · ${m.outputPer1M}/M out
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
