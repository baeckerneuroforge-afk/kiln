"use client";

import { useEffect, useState } from "react";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Network,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TopicData {
  topic: string;
  count: number;
  trend: string;
  sentiment: string;
  relatedTopics: string[];
  agentCount: number;
}

interface IntelligenceData {
  totalTopics: number;
  totalMentions: number;
  topTopics: TopicData[];
  trendingUp: { topic: string; count: number }[];
  positiveSentiment: number;
  crossAgentPatterns: { topic: string; agents: number; totalMentions: number }[];
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
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/intelligence?days=${days}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

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
              Cross-Agent Insights aus allen Gesprächen
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
          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="ml-2 h-8"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              label="Topics erkannt"
              value={data.totalTopics}
              icon={BarChart3}
              color="text-blue-400"
              bgColor="bg-blue-500/10"
            />
            <KPICard
              label="Gesamt-Mentions"
              value={data.totalMentions}
              icon={Brain}
              color="text-purple-400"
              bgColor="bg-purple-500/10"
            />
            <KPICard
              label="Trending Up"
              value={data.trendingUp.length}
              icon={TrendingUp}
              color="text-green-400"
              bgColor="bg-green-500/10"
            />
            <KPICard
              label="Cross-Agent Patterns"
              value={data.crossAgentPatterns.length}
              icon={Network}
              color="text-amber-400"
              bgColor="bg-amber-500/10"
            />
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

            {/* Sidebar: Trending + Cross-Agent */}
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
        </>
      )}
    </div>
  );
}

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
