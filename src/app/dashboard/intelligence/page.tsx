"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Network,
  Loader2,
  RefreshCw,
  AlertTriangle,
  X,
  Users,
  Target,
  CalendarCheck,
  Sparkles,
  FileDown,
  Swords,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ── Types ── */

interface TopicData {
  topic: string;
  count: number;
  trend: string;
  sentiment: string;
  relatedTopics: string[];
  agentCount: number;
  leadCount: number;
  appointmentCount: number;
  conversionRate: number;
}

interface CompetitorData {
  name: string;
  mentions: number;
  sentiment: string;
  context: string;
}

interface PredictionData {
  topic: string;
  currentWeek: number;
  predictedNextWeek: number;
  confidence: number;
  reasoning: string;
}

interface TrendAlertData {
  id: string;
  type: string;
  topic: string;
  changePercent: number;
  thisWeek: number;
  lastWeek: number;
  createdAt: string;
}

interface IntelligenceData {
  totalTopics: number;
  totalMentions: number;
  totalLeads: number;
  totalAppointments: number;
  topTopics: TopicData[];
  trendingUp: { topic: string; count: number }[];
  positiveSentiment: number;
  crossAgentPatterns: { topic: string; agents: number; totalMentions: number }[];
  competitors: CompetitorData[];
  predictions: PredictionData[];
  recommendations: string[];
  revenueTopics: TopicData[];
  avgConversionRate: number;
}

const sentimentColors: Record<string, string> = {
  positive: "text-green-400 bg-green-500/10",
  negative: "text-red-400 bg-red-500/10",
  neutral: "text-zinc-400 bg-zinc-500/10",
  high_interest: "text-amber-400 bg-amber-500/10",
};

const trendIcons: Record<string, React.ElementType> = {
  increasing: TrendingUp,
  decreasing: TrendingDown,
  stable: Minus,
};

export default function IntelligencePage() {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [alerts, setAlerts] = useState<TrendAlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dataRes, alertsRes] = await Promise.all([
        fetch(`/api/intelligence?days=${days}`),
        fetch("/api/intelligence/alerts"),
      ]);
      if (dataRes.ok) setData(await dataRes.json());
      if (alertsRes.ok) {
        const alertData = await alertsRes.json();
        setAlerts(alertData.alerts || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function dismissAlert(alertId: string) {
    await fetch("/api/intelligence/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId }),
    });
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  function exportPdf() {
    window.open(`/api/intelligence/report?format=pdf&days=${days}`, "_blank");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
            <Brain className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Business Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Cross-Agent Insights · Revenue · Wettbewerber · Prognosen
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                days === d
                  ? "bg-purple-500/15 text-purple-400"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {d}d
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={exportPdf} className="ml-2 h-8">
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            PDF Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-8"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Trend Alerts Banner */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">
              {alerts.length} neue{alerts.length !== 1 ? " Trends" : "r Trend"} erkannt
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between rounded-lg bg-background/50 border border-border px-3 py-2.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    "text-lg font-bold",
                    alert.type === "decline" ? "text-red-400" : alert.type === "new_topic" ? "text-blue-400" : "text-green-400"
                  )}>
                    {alert.type === "decline" ? "↓" : "↑"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {alert.topic.replace("competitor:", "")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {alert.type === "new_topic"
                        ? "Neues Topic"
                        : `${alert.changePercent > 0 ? "+" : ""}${alert.changePercent}% (${alert.lastWeek} → ${alert.thisWeek})`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.totalTopics === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Brain className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-medium text-foreground">Noch keine Insights</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Business Intelligence wird automatisch aus Agent-Gesprächen extrahiert.
            Starte Gespräche mit deinen Agents, um Trends und Muster zu erkennen.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <KPICard label="Topics" value={data.totalTopics} icon={BarChart3} color="text-blue-400" bgColor="bg-blue-500/10" />
            <KPICard label="Mentions" value={data.totalMentions} icon={Brain} color="text-purple-400" bgColor="bg-purple-500/10" />
            <KPICard label="Leads" value={data.totalLeads} icon={Target} color="text-green-400" bgColor="bg-green-500/10" />
            <KPICard label="Termine" value={data.totalAppointments} icon={CalendarCheck} color="text-orange-400" bgColor="bg-orange-500/10" />
            <KPICard label="Trending ↑" value={data.trendingUp.length} icon={TrendingUp} color="text-emerald-400" bgColor="bg-emerald-500/10" />
            <KPICard label="Wettbewerber" value={data.competitors.length} icon={Swords} color="text-rose-400" bgColor="bg-rose-500/10" />
          </div>

          {/* Main Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Top Topics — spans 2 columns */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-card/50 p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Top Topics</h2>
              <div className="space-y-2">
                {data.topTopics.map((topic) => {
                  const TrendIcon = trendIcons[topic.trend] || Minus;
                  return (
                    <div
                      key={topic.topic}
                      className="flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {topic.topic}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                              sentimentColors[topic.sentiment] || sentimentColors.neutral
                            )}
                          >
                            {topic.sentiment}
                          </span>
                          {topic.leadCount > 0 && (
                            <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">
                              {topic.leadCount} Leads
                            </span>
                          )}
                        </div>
                        {topic.relatedTopics.length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            Related: {topic.relatedTopics.join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {topic.agentCount} {topic.agentCount === 1 ? "Agent" : "Agents"}
                        </span>
                        <div className="flex items-center gap-1">
                          <TrendIcon
                            className={cn(
                              "h-3.5 w-3.5",
                              topic.trend === "increasing"
                                ? "text-green-400"
                                : topic.trend === "decreasing"
                                ? "text-red-400"
                                : "text-zinc-500"
                            )}
                          />
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {topic.count}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Trending Up */}
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-400" />
                  Trending
                </h2>
                {data.trendingUp.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Keine steigenden Trends</p>
                ) : (
                  <div className="space-y-2">
                    {data.trendingUp.map((t) => (
                      <div key={t.topic} className="flex items-center justify-between">
                        <span className="text-xs text-foreground">{t.topic}</span>
                        <span className="text-xs font-medium text-green-400">{t.count}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cross-Agent Patterns */}
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Network className="h-4 w-4 text-amber-400" />
                  Cross-Agent Patterns
                </h2>
                {data.crossAgentPatterns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Topics die in mehreren Agents auftauchen erscheinen hier
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.crossAgentPatterns.map((p) => (
                      <div key={p.topic} className="rounded-lg bg-amber-500/5 border border-amber-500/10 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">{p.topic}</span>
                          <span className="text-[10px] text-amber-400">{p.agents} Agents</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {p.totalMentions} Mentions insgesamt
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Revenue Attribution + Competitor Intelligence */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Revenue Topics */}
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <Target className="h-4 w-4 text-green-400" />
                Revenue Topics
              </h2>
              <p className="text-[10px] text-muted-foreground mb-4">
                Topics nach Lead-Generierung · Ø Conversion: {(data.avgConversionRate * 100).toFixed(1)}%
              </p>
              {data.revenueTopics.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Noch keine Lead-Daten — aktiviere COLLECT_EMAIL oder SCORE_LEAD Actions
                </p>
              ) : (
                <div className="space-y-1">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_60px_50px_60px] gap-2 px-3 py-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    <span>Topic</span>
                    <span className="text-right">Mentions</span>
                    <span className="text-right">Leads</span>
                    <span className="text-right">Conv.</span>
                  </div>
                  {data.revenueTopics.map((t, i) => {
                    const isTop = i === 0 && t.conversionRate > 0;
                    return (
                      <div
                        key={t.topic}
                        className={cn(
                          "grid grid-cols-[1fr_60px_50px_60px] gap-2 rounded-lg px-3 py-2.5 items-center",
                          isTop ? "bg-green-500/5 border border-green-500/10" : "bg-muted/30"
                        )}
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-foreground truncate block">{t.topic}</span>
                          {t.appointmentCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {t.appointmentCount} Termine
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground text-right tabular-nums">{t.count}</span>
                        <span className={cn("text-xs font-semibold text-right tabular-nums", isTop ? "text-green-400" : "text-foreground")}>{t.leadCount}</span>
                        <span className={cn("text-xs font-semibold text-right tabular-nums", t.conversionRate > data.avgConversionRate ? "text-green-400" : "text-foreground")}>
                          {(t.conversionRate * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                  {data.revenueTopics.length > 0 && data.avgConversionRate > 0 && (
                    <p className="text-[10px] text-green-400/80 px-3 pt-2">
                      Gespräche über &quot;{data.revenueTopics[0].topic}&quot; generieren{" "}
                      {data.avgConversionRate > 0
                        ? `${(data.revenueTopics[0].conversionRate / data.avgConversionRate).toFixed(1)}x`
                        : "—"}{" "}
                      mehr Leads als der Durchschnitt
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Competitor Mentions */}
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <Swords className="h-4 w-4 text-rose-400" />
                Wettbewerber-Erwähnungen
              </h2>
              <p className="text-[10px] text-muted-foreground mb-4">
                Automatisch erkannte Competitor-Mentions aus Gesprächen
              </p>
              {data.competitors.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Noch keine Wettbewerber erkannt
                </p>
              ) : (
                <div className="space-y-2">
                  {data.competitors.map((c) => (
                    <div
                      key={c.name}
                      className="rounded-lg bg-muted/30 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground">{c.name}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                              sentimentColors[c.sentiment] || sentimentColors.neutral
                            )}
                          >
                            {c.sentiment}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">{c.mentions}x</span>
                        </div>
                      </div>
                      {c.context && (
                        <p className="text-[10px] text-muted-foreground truncate">{c.context}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Predictions + Recommendations */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Predictions */}
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-400" />
                Nächste Woche — Prognose
              </h2>
              <p className="text-[10px] text-muted-foreground mb-4">
                Trend-Extrapolation basierend auf den letzten 3 Wochen
              </p>
              {data.predictions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Noch nicht genügend Wochen-Daten für Prognosen
                </p>
              ) : (
                <div className="space-y-2">
                  {data.predictions.map((p) => {
                    const change = p.predictedNextWeek - p.currentWeek;
                    const pct = p.currentWeek > 0 ? Math.round((change / p.currentWeek) * 100) : 0;
                    return (
                      <div key={p.topic} className="rounded-lg bg-muted/30 px-3 py-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-foreground">{p.topic}</span>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-xs font-semibold tabular-nums",
                              change > 0 ? "text-green-400" : change < 0 ? "text-red-400" : "text-muted-foreground"
                            )}>
                              ~{p.predictedNextWeek} ({change > 0 ? "+" : ""}{pct}%)
                            </span>
                            <ConfidenceDot confidence={p.confidence} />
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{p.reasoning}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI Recommendations */}
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                AI-Empfehlungen
              </h2>
              <p className="text-[10px] text-muted-foreground mb-4">
                Automatisch generierte Handlungsempfehlungen
              </p>
              {data.recommendations.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Mehr Daten sammeln — Empfehlungen erscheinen ab ~20 Mentions
                </p>
              ) : (
                <div className="space-y-2">
                  {data.recommendations.map((r, i) => (
                    <div key={i} className="flex gap-3 rounded-lg bg-blue-500/5 border border-blue-500/10 px-3 py-2.5">
                      <span className="text-xs font-bold text-blue-400 shrink-0">{i + 1}.</span>
                      <p className="text-xs text-foreground leading-relaxed">{r}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Components ── */

function KPICard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", bgColor)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.7
      ? "bg-green-400"
      : confidence >= 0.4
      ? "bg-amber-400"
      : "bg-red-400";
  return (
    <div className="flex items-center gap-1">
      <div className={cn("h-2 w-2 rounded-full", color)} />
      <span className="text-[10px] text-muted-foreground">{Math.round(confidence * 100)}%</span>
    </div>
  );
}
