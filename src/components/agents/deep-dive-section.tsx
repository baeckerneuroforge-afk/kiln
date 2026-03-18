"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Brain,
  ChevronDown,
  Lightbulb,
  Loader2,
  Minus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  DeepDiveResult,
  QuestionCluster,
  ImprovementSuggestion,
  TrendComparison,
} from "@/lib/conversation-analytics";

interface DeepDiveSectionProps {
  agentId: string;
}

const PERIOD_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
] as const;

const SUGGESTION_COLORS: Record<ImprovementSuggestion["type"], { bg: string; text: string; border: string }> = {
  knowledge: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  prompt: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  engagement: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  conversion: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
};

const PRIORITY_BADGE: Record<ImprovementSuggestion["priority"], string> = {
  high: "bg-red-500/10 text-red-400",
  medium: "bg-amber-500/10 text-amber-400",
  low: "bg-slate-500/10 text-slate-400",
};

function TrendIcon({ direction }: { direction: TrendComparison["direction"] }) {
  if (direction === "up") return <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (direction === "down") return <ArrowDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function QualityBar({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-emerald-500" :
    score >= 50 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted">
        <div
          className={cn("h-1.5 rounded-full transition-all", color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{score}%</span>
    </div>
  );
}

export function DeepDiveSection({ agentId }: DeepDiveSectionProps) {
  const [data, setData] = useState<DeepDiveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [expanded, setExpanded] = useState(true);

  const loadDeepDive = useCallback(async (period: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/analytics/deep-dive?days=${period}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadDeepDive(days);
  }, [days, loadDeepDive]);

  const hoursData = data?.leadIntelligence.bestConversionHours.map((h) => ({
    hour: `${h.hour}:00`,
    conversions: h.conversions,
  })) || [];

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between p-5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20">
            <Brain className="h-4.5 w-4.5 text-violet-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-foreground">Deep Dive Analytics</h3>
            <p className="text-xs text-muted-foreground">
              AI-powered conversation insights and improvement suggestions
            </p>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="space-y-6 border-t border-border p-5 pt-4">
          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 rounded-lg bg-muted p-0.5">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDays(opt.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    days === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadDeepDive(days)}
              disabled={loading}
              className="text-xs"
            >
              {loading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
              Refresh
            </Button>
          </div>

          {loading && !data && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                <p className="text-sm text-muted-foreground">Analyzing conversations...</p>
              </div>
            </div>
          )}

          {data && (
            <>
              {/* Trend Cards */}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {data.trends.map((t) => (
                  <div key={t.metric} className="rounded-xl border border-border bg-background/60 p-3.5">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t.metric}</p>
                    <div className="mt-1.5 flex items-end justify-between">
                      <p className="text-xl font-semibold text-foreground">{t.current}</p>
                      <div className="flex items-center gap-1">
                        <TrendIcon direction={t.direction} />
                        <span className={cn(
                          "text-xs font-medium",
                          t.direction === "up" ? "text-emerald-400" :
                          t.direction === "down" ? "text-red-400" :
                          "text-muted-foreground"
                        )}>
                          {t.changePercent > 0 ? "+" : ""}{t.changePercent}%
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      vs. previous {days} days ({t.previous})
                    </p>
                  </div>
                ))}
              </div>

              {/* Conversion Funnel + Quality */}
              <div className="grid gap-6 xl:grid-cols-2">
                {/* Funnel */}
                <div className="rounded-xl border border-border bg-background/60 p-5">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-foreground">Conversion Funnel</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {data.conversationCount} conversations analyzed
                    </p>
                  </div>
                  <div className="space-y-2">
                    {data.conversionFunnel.map((stage, i) => (
                      <div key={stage.label} className="flex items-center gap-3">
                        <div className="w-36 text-xs text-muted-foreground truncate">{stage.label}</div>
                        <div className="flex-1">
                          <div className="h-7 rounded-lg bg-muted overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-lg flex items-center px-2 text-[10px] font-medium text-white transition-all",
                                i === 0 ? "bg-slate-500" :
                                i === 1 ? "bg-blue-500" :
                                i === 2 ? "bg-kiln-orange" :
                                "bg-emerald-500"
                              )}
                              style={{ width: `${Math.max(stage.percentage, 5)}%` }}
                            >
                              {stage.count}
                            </div>
                          </div>
                        </div>
                        <div className="w-12 text-right text-xs font-medium text-muted-foreground">
                          {stage.percentage}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quality Metrics */}
                <div className="rounded-xl border border-border bg-background/60 p-5">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-foreground">Quality Metrics</h4>
                    <p className="mt-1 text-xs text-muted-foreground">Conversation quality indicators</p>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Avg Length</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{data.quality.avgConversationLength} msgs</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Avg Response</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{data.quality.avgResponseWords} words</p>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Positive endings</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-muted">
                            <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${data.quality.positiveEndingRate}%` }} />
                          </div>
                          <span className="w-8 text-right text-xs text-emerald-400">{data.quality.positiveEndingRate}%</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Negative endings</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-muted">
                            <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${data.quality.negativeEndingRate}%` }} />
                          </div>
                          <span className="w-8 text-right text-xs text-red-400">{data.quality.negativeEndingRate}%</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Neutral endings</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-muted">
                            <div className="h-1.5 rounded-full bg-slate-500" style={{ width: `${data.quality.neutralEndingRate}%` }} />
                          </div>
                          <span className="w-8 text-right text-xs text-slate-400">{data.quality.neutralEndingRate}%</span>
                        </div>
                      </div>
                    </div>
                    {data.quality.avgResponseTimeSec !== null && (
                      <p className="text-xs text-muted-foreground">
                        Avg response time: <span className="font-medium text-foreground">{data.quality.avgResponseTimeSec}s</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Top Questions */}
              {data.topQuestions.length > 0 && (
                <div className="rounded-xl border border-border bg-background/60 p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Top Question Themes</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        AI-clustered from {data.conversationCount} conversations. Quality = how well the agent answered.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-medium text-violet-400">
                      <Sparkles className="h-3 w-3" />
                      AI-analyzed
                    </div>
                  </div>
                  <div className="space-y-2">
                    {data.topQuestions.map((q) => (
                      <QuestionRow key={q.theme} cluster={q} />
                    ))}
                  </div>
                </div>
              )}

              {/* Lead Intelligence + Best Hours */}
              <div className="grid gap-6 xl:grid-cols-2">
                {/* Lead Quality Distribution */}
                <div className="rounded-xl border border-border bg-background/60 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-400" />
                    <h4 className="text-sm font-semibold text-foreground">Lead Intelligence</h4>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <p className="text-2xl font-semibold text-foreground">{data.leadIntelligence.totalLeads}</p>
                      <p className="text-xs text-muted-foreground">total leads captured</p>
                    </div>
                    {(data.leadIntelligence.qualityDistribution.hot + data.leadIntelligence.qualityDistribution.warm + data.leadIntelligence.qualityDistribution.cold) > 0 && (
                      <div className="flex gap-3">
                        {[
                          { label: "Hot", count: data.leadIntelligence.qualityDistribution.hot, color: "bg-red-500", text: "text-red-400" },
                          { label: "Warm", count: data.leadIntelligence.qualityDistribution.warm, color: "bg-amber-500", text: "text-amber-400" },
                          { label: "Cold", count: data.leadIntelligence.qualityDistribution.cold, color: "bg-slate-500", text: "text-slate-400" },
                        ].map((q) => (
                          <div key={q.label} className="flex-1 rounded-lg border border-border bg-muted/30 p-3 text-center">
                            <div className={cn("mx-auto mb-1.5 h-2 w-2 rounded-full", q.color)} />
                            <p className={cn("text-lg font-semibold", q.text)}>{q.count}</p>
                            <p className="text-[10px] text-muted-foreground">{q.label}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {data.leadIntelligence.commonInterests.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Common Interests</p>
                        <div className="flex flex-wrap gap-1.5">
                          {data.leadIntelligence.commonInterests.map((i) => (
                            <span key={i.interest} className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-400">
                              {i.interest} ({i.count})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Best Conversion Hours */}
                {hoursData.length > 0 && (
                  <div className="rounded-xl border border-border bg-background/60 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                      <h4 className="text-sm font-semibold text-foreground">Best Conversion Hours</h4>
                    </div>
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hoursData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
                          <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fill: "#A1A1AA", fontSize: 11 }} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#A1A1AA", fontSize: 11 }} />
                          <Tooltip
                            cursor={{ fill: "rgba(34, 197, 94, 0.08)" }}
                            contentStyle={{
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "#111111",
                              color: "#F5F5F5",
                            }}
                          />
                          <Bar dataKey="conversions" radius={[6, 6, 0, 0]} fill="#22C55E" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {/* Improvement Suggestions */}
              {data.suggestions.length > 0 && (
                <div className="rounded-xl border border-border bg-background/60 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-400" />
                    <h4 className="text-sm font-semibold text-foreground">Improvement Suggestions</h4>
                  </div>
                  <div className="space-y-3">
                    {data.suggestions.map((s) => {
                      const colors = SUGGESTION_COLORS[s.type];
                      return (
                        <div key={s.id} className={cn("rounded-xl border p-4", colors.border, colors.bg)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className={cn("text-sm font-medium", colors.text)}>{s.title}</p>
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", PRIORITY_BADGE[s.priority])}>
                                  {s.priority}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                              {s.metric && (
                                <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                                  <ArrowRight className="mr-1 inline h-3 w-3" />
                                  {s.metric}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Exit Topics */}
              {data.quality.commonExitTopics.length > 0 && (
                <div className="rounded-xl border border-border bg-background/60 p-5">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-foreground">Common Exit Topics</h4>
                    <p className="mt-1 text-xs text-muted-foreground">Last messages visitors send before leaving the conversation.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.quality.commonExitTopics.map((topic) => (
                      <span key={topic} className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                        &quot;{topic}&quot;
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Expandable question row
function QuestionRow({ cluster }: { cluster: QuestionCluster }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">{cluster.theme}</p>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {cluster.count}x ({cluster.percentage}%)
            </span>
          </div>
        </div>
        <QualityBar score={cluster.qualityScore} />
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && cluster.examples.length > 0 && (
        <div className="border-t border-border px-3 py-2.5 space-y-1">
          {cluster.examples.map((ex, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              &quot;{ex}&quot;
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
