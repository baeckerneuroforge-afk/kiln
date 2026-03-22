"use client";

import { useState, useEffect } from "react";
import { Clock, Wallet, CreditCard, TrendingUp, BarChart3 } from "lucide-react";

interface ROISummary {
  totalTimeSavedMinutes: number;
  totalTimeSavedHours: number;
  totalMoneySaved: number;
  totalEurosCost: number;
  overallROI: number;
  overallROIMultiple: string;
  agentBreakdown: Array<{
    agentId: string;
    agentName: string;
    runsCompleted: number;
    timeSavedHours: number;
    moneySaved: number;
    eurosCost: number;
    roiMultiple: string;
  }>;
}

type Period = "weekly" | "monthly";

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n: number): string {
  return n.toLocaleString("de-DE");
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

function SkeletonTable() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 animate-pulse">
      <div className="h-5 w-48 rounded bg-zinc-800 mb-6" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex gap-4 mb-4">
          <div className="h-4 w-32 rounded bg-zinc-800" />
          <div className="h-4 w-16 rounded bg-zinc-800" />
          <div className="h-4 w-20 rounded bg-zinc-800" />
          <div className="h-4 w-20 rounded bg-zinc-800" />
          <div className="h-4 w-20 rounded bg-zinc-800" />
          <div className="h-4 w-16 rounded bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

export default function ROIDashboard() {
  const [period, setPeriod] = useState<Period>("monthly");
  const [data, setData] = useState<ROISummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/dashboard/roi?period=${period}`)
      .then((res) => {
        if (!res.ok) throw new Error("Fehler beim Laden der ROI-Daten");
        return res.json();
      })
      .then((json: ROISummary) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  const hasROIConfig =
    data && data.agentBreakdown.some((a) => a.roiMultiple !== "—");

  return (
    <div className="min-h-screen bg-stone-950 text-zinc-100 p-6 lg:p-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-serif text-zinc-100">ROI Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Wie viel sparen deine AI Agents?
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
          <button
            onClick={() => setPeriod("weekly")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              period === "weekly"
                ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                : "text-zinc-500 hover:text-zinc-300 border border-transparent"
            }`}
          >
            7 Tage
          </button>
          <button
            onClick={() => setPeriod("monthly")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              period === "monthly"
                ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                : "text-zinc-500 hover:text-zinc-300 border border-transparent"
            }`}
          >
            30 Tage
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-6 mb-8">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Hero Metric Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : data && hasROIConfig ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Zeitersparnis */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="flex items-center gap-2 text-zinc-500 text-sm mb-3">
                <Clock className="h-4 w-4" />
                <span>Zeitersparnis</span>
              </div>
              <p className="text-3xl font-semibold text-green-400 tracking-tight">
                {fmtInt(data.totalTimeSavedHours)}h
              </p>
              <p className="text-xs text-zinc-600 mt-1">
                {fmtInt(data.totalTimeSavedMinutes)} Minuten
              </p>
            </div>

            {/* Geldersparnis */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="flex items-center gap-2 text-zinc-500 text-sm mb-3">
                <Wallet className="h-4 w-4" />
                <span>Geldersparnis</span>
              </div>
              <p className="text-3xl font-semibold text-green-400 tracking-tight">
                {fmt(data.totalMoneySaved)}
              </p>
            </div>

            {/* Agent-Kosten */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="flex items-center gap-2 text-zinc-500 text-sm mb-3">
                <CreditCard className="h-4 w-4" />
                <span>Agent-Kosten</span>
              </div>
              <p className="text-3xl font-semibold text-zinc-400 tracking-tight">
                {fmt(data.totalEurosCost)}
              </p>
            </div>

            {/* ROI */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="flex items-center gap-2 text-zinc-500 text-sm mb-3">
                <TrendingUp className="h-4 w-4" />
                <span>ROI</span>
              </div>
              <p className="text-3xl font-semibold text-orange-400 tracking-tight">
                {data.overallROIMultiple}
              </p>
            </div>
          </div>

          {/* Per-Agent Breakdown Table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 mb-8 overflow-hidden">
            <div className="p-6 pb-4">
              <h2 className="text-lg font-medium text-zinc-200">
                Aufschlüsselung nach Agent
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-zinc-800 text-zinc-500 text-left">
                    <th className="px-6 py-3 font-medium">Agent</th>
                    <th className="px-6 py-3 font-medium text-right">Runs</th>
                    <th className="px-6 py-3 font-medium text-right">
                      Zeit gespart
                    </th>
                    <th className="px-6 py-3 font-medium text-right">
                      Geld gespart
                    </th>
                    <th className="px-6 py-3 font-medium text-right">Kosten</th>
                    <th className="px-6 py-3 font-medium text-right">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.agentBreakdown]
                    .sort((a, b) => {
                      // Agents mit "—" ans Ende
                      if (a.roiMultiple === "—" && b.roiMultiple !== "—")
                        return 1;
                      if (a.roiMultiple !== "—" && b.roiMultiple === "—")
                        return -1;
                      // Sonst nach moneySaved / eurosCost absteigend
                      const roiA =
                        a.eurosCost > 0 ? a.moneySaved / a.eurosCost : 0;
                      const roiB =
                        b.eurosCost > 0 ? b.moneySaved / b.eurosCost : 0;
                      return roiB - roiA;
                    })
                    .map((agent) => (
                      <tr
                        key={agent.agentId}
                        className="border-t border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
                      >
                        <td className="px-6 py-4 text-zinc-200 font-medium">
                          {agent.agentName}
                        </td>
                        <td className="px-6 py-4 text-zinc-400 text-right tabular-nums">
                          {fmtInt(agent.runsCompleted)}
                        </td>
                        <td className="px-6 py-4 text-zinc-400 text-right tabular-nums">
                          {agent.roiMultiple === "—"
                            ? "—"
                            : `${fmtInt(agent.timeSavedHours)}h`}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums">
                          {agent.roiMultiple === "—" ? (
                            <span className="text-zinc-600">—</span>
                          ) : (
                            <span className="text-green-400">
                              €{fmt(agent.moneySaved)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-zinc-400 text-right tabular-nums">
                          {agent.roiMultiple === "—"
                            ? "—"
                            : `€${fmt(agent.eurosCost)}`}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {agent.roiMultiple === "—" ? (
                            <a
                              href={`/agents/${agent.agentId}/settings`}
                              className="text-orange-400 hover:text-orange-300 text-xs underline underline-offset-2 transition-colors"
                            >
                              ROI einrichten
                            </a>
                          ) : (
                            <span className="text-orange-400 font-medium tabular-nums">
                              {agent.roiMultiple}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Motivational Insight */}
          {data.totalMoneySaved > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 border-l-4 border-l-orange-500 p-6">
              <p className="text-zinc-300 text-sm leading-relaxed">
                Deine Agents haben diesen Monat{" "}
                <span className="text-zinc-100 font-medium">
                  {fmtInt(data.totalTimeSavedHours)}h
                </span>{" "}
                Arbeit erledigt — für{" "}
                <span className="text-zinc-100 font-medium">
                  €{fmt(data.totalEurosCost)}
                </span>{" "}
                statt{" "}
                <span className="text-green-400 font-medium">
                  €{fmt(data.totalMoneySaved)}
                </span>
                .
              </p>
            </div>
          )}
        </>
      ) : loading ? null : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 py-20 px-6">
          <div className="rounded-full bg-zinc-800/50 p-4 mb-6">
            <BarChart3 className="h-8 w-8 text-zinc-600" />
          </div>
          <h2 className="text-lg font-medium text-zinc-300 mb-2">
            Noch kein ROI-Tracking eingerichtet
          </h2>
          <p className="text-sm text-zinc-500 mb-6 text-center max-w-md">
            Richte das ROI-Tracking für einen deiner Agents ein, um zu sehen wie
            viel Zeit und Geld du sparst.
          </p>
          <a
            href="/agents"
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
          >
            ROI für ersten Agent einrichten
          </a>
        </div>
      )}

      {/* Loading skeletons for table */}
      {loading && (
        <div className="mt-8">
          <SkeletonTable />
        </div>
      )}
    </div>
  );
}
