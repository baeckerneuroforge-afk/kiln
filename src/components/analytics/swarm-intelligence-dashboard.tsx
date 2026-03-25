"use client";

import { useState, useEffect } from "react";
import { Brain, Zap, Timer, TrendingUp, BarChart3, Wrench } from "lucide-react";

interface SwarmAnalytics {
  totalExecutions: number;
  byTaskType: Array<{
    taskType: string;
    count: number;
    avgQuality: number;
    avgCredits: number;
    avgTimeMs: number;
  }>;
  averages: {
    quality: number;
    credits: number;
    timeMs: number;
    agents: number;
  };
  trend: {
    qualityChangePercent: number;
    thisWeekCount: number;
    lastWeekCount: number;
  };
  promptEffectiveness: Array<{
    promptHash: string;
    avgQuality: number;
    avgCredits: number;
    sampleSize: number;
  }>;
  toolCorrelations: Array<{
    tool: string;
    avgQualityWith: number;
    avgQualityWithout: number;
    usageCount: number;
    recommendation: "always" | "situational" | "avoid";
  }>;
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${fmt(sec)}s`;
  return `${fmt(sec / 60)}min`;
}

function qualityColor(q: number): string {
  if (q >= 0.7) return "text-green-400";
  if (q >= 0.4) return "text-amber-400";
  return "text-red-400";
}

function qualityBar(q: number): string {
  if (q >= 0.7) return "bg-green-500";
  if (q >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 animate-pulse">
      <div className="h-4 w-24 rounded bg-zinc-800 mb-4" />
      <div className="h-8 w-32 rounded bg-zinc-800 mb-2" />
      <div className="h-3 w-16 rounded bg-zinc-800" />
    </div>
  );
}

export default function SwarmIntelligenceDashboard() {
  const [data, setData] = useState<SwarmAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTaskType, setSelectedTaskType] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedTaskType) params.set("taskType", selectedTaskType);
    fetch(`/api/analytics/swarm-intelligence?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedTaskType]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-zinc-100 font-serif">Swarm Intelligence</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (!data || data.totalExecutions === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <Brain className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
        <h3 className="text-zinc-300 font-medium mb-1">Noch keine Swarm-Daten</h3>
        <p className="text-zinc-500 text-sm">
          Starte Agent Swarm Aufgaben, um hier Lern-Insights zu sehen.
        </p>
      </div>
    );
  }

  const trendIcon = data.trend.qualityChangePercent > 0 ? "+" : "";
  const trendColor = data.trend.qualityChangePercent > 0 ? "text-green-400" : data.trend.qualityChangePercent < 0 ? "text-red-400" : "text-zinc-400";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-100 font-serif flex items-center gap-2">
          <Brain className="w-5 h-5 text-orange-400" />
          Swarm Intelligence
        </h2>
        {data.byTaskType.length > 0 && (
          <select
            value={selectedTaskType}
            onChange={(e) => setSelectedTaskType(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-orange-500"
          >
            <option value="">Alle Task-Typen</option>
            {data.byTaskType.map((t) => (
              <option key={t.taskType} value={t.taskType}>
                {t.taskType}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3">
            <BarChart3 className="w-4 h-4" />
            Ausführungen
          </div>
          <div className="text-2xl font-semibold text-zinc-100">{data.totalExecutions}</div>
          <div className="text-xs text-zinc-500 mt-1">
            {data.trend.thisWeekCount} diese Woche
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3">
            <TrendingUp className="w-4 h-4" />
            Ø Qualität
          </div>
          <div className={`text-2xl font-semibold ${qualityColor(data.averages.quality)}`}>
            {Math.round(data.averages.quality * 100)}%
          </div>
          <div className={`text-xs mt-1 ${trendColor}`}>
            {trendIcon}{fmt(data.trend.qualityChangePercent)}% vs. letzte Woche
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3">
            <Zap className="w-4 h-4" />
            Ø Credits
          </div>
          <div className="text-2xl font-semibold text-zinc-100">{fmt(data.averages.credits)}</div>
          <div className="text-xs text-zinc-500 mt-1">
            Ø {fmt(data.averages.agents)} Agents
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3">
            <Timer className="w-4 h-4" />
            Ø Dauer
          </div>
          <div className="text-2xl font-semibold text-zinc-100">{fmtMs(data.averages.timeMs)}</div>
          <div className="text-xs text-zinc-500 mt-1">pro Swarm-Ausführung</div>
        </div>
      </div>

      {/* Task Type Breakdown */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Qualität nach Task-Typ</h3>
        <div className="space-y-3">
          {data.byTaskType.map((t) => (
            <div key={t.taskType} className="flex items-center gap-3">
              <span className="text-sm text-zinc-400 w-28 truncate">{t.taskType}</span>
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${qualityBar(t.avgQuality)}`}
                  style={{ width: `${Math.round(t.avgQuality * 100)}%` }}
                />
              </div>
              <span className={`text-sm font-mono w-12 text-right ${qualityColor(t.avgQuality)}`}>
                {Math.round(t.avgQuality * 100)}%
              </span>
              <span className="text-xs text-zinc-500 w-16 text-right">{t.count}x</span>
              <span className="text-xs text-zinc-500 w-20 text-right">{fmt(t.avgCredits)} Cr</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tool Correlations */}
      {data.toolCorrelations.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-zinc-500" />
            Tool-Korrelationen
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                  <th className="text-left pb-2 font-normal">Tool</th>
                  <th className="text-right pb-2 font-normal">Qualität mit</th>
                  <th className="text-right pb-2 font-normal">Qualität ohne</th>
                  <th className="text-right pb-2 font-normal">Nutzung</th>
                  <th className="text-right pb-2 font-normal">Empfehlung</th>
                </tr>
              </thead>
              <tbody>
                {data.toolCorrelations.map((tc) => (
                  <tr key={tc.tool} className="border-b border-zinc-800/50">
                    <td className="py-2 text-zinc-300 font-mono">{tc.tool}</td>
                    <td className={`py-2 text-right ${qualityColor(tc.avgQualityWith)}`}>
                      {Math.round(tc.avgQualityWith * 100)}%
                    </td>
                    <td className={`py-2 text-right ${qualityColor(tc.avgQualityWithout)}`}>
                      {Math.round(tc.avgQualityWithout * 100)}%
                    </td>
                    <td className="py-2 text-right text-zinc-400">{tc.usageCount}x</td>
                    <td className="py-2 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        tc.recommendation === "always"
                          ? "bg-green-500/10 text-green-400"
                          : tc.recommendation === "avoid"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-zinc-700/50 text-zinc-400"
                      }`}>
                        {tc.recommendation === "always" ? "Immer" : tc.recommendation === "avoid" ? "Vermeiden" : "Situativ"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
