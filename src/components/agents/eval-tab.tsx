"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  AlertCircle,
  BookOpen,
  Clock3,
  Gauge,
  MessageCircleQuestion,
  MessageSquare,
  Percent,
  Target,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EvalSuggestions } from "@/components/agents/eval-suggestions";

interface EvalData {
  configuredActions: string[];
  summary: {
    totalConversations7d: number;
    totalConversations30d: number;
    averageMessagesPerConversation: number;
    averageResponseTimeSeconds: number | null;
    bounceRate: number;
    actionTriggeredConversations: number;
    leadCaptureConversations: number;
    appointmentConversations: number;
  };
  unansweredQuestions: {
    conversationId: string;
    question: string;
    response: string;
    createdAt: string;
  }[];
  topTopics: {
    topic: string;
    count: number;
  }[];
  funnel: {
    totalConversations: number;
    actionTriggeredConversations: number;
    successfulActionConversations: number;
  };
  periodComparison: {
    label: string;
    conversations: number;
  }[];
}

interface EvalTabProps {
  agentId: string;
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  iconClassName,
  iconBgClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  iconClassName: string;
  iconBgClassName: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBgClassName)}>
          <Icon className={cn("h-5 w-5", iconClassName)} />
        </div>
      </div>
    </div>
  );
}

export function EvalTab({ agentId }: EvalTabProps) {
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadEval = useCallback(async () => {
    try {
      const response = await fetch(`/api/agents/${agentId}/eval`);
      if (!response.ok) throw new Error();
      setData(await response.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadEval();
  }, [loadEval]);

  const funnelData = useMemo(() => {
    if (!data) return [];

    return [
      {
        stage: "Conversations",
        value: data.funnel.totalConversations,
        fill: "#94A3B8",
      },
      {
        stage: "With Actions",
        value: data.funnel.actionTriggeredConversations,
        fill: "#F97316",
      },
      {
        stage: "Successful",
        value: data.funnel.successfulActionConversations,
        fill: "#22C55E",
      },
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border bg-card p-4">
              <div className="skeleton h-4 w-24 rounded" />
              <div className="skeleton mt-3 h-8 w-20 rounded" />
              <div className="skeleton mt-2 h-3 w-32 rounded" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="skeleton h-[320px] rounded-xl" />
          <div className="skeleton h-[320px] rounded-xl" />
        </div>
        <div className="skeleton h-[280px] rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-foreground">Eval data could not be loaded.</p>
        <p className="mt-1 text-xs text-muted-foreground">Try again after the agent has collected some conversations.</p>
      </div>
    );
  }

  const successRate = data.funnel.actionTriggeredConversations > 0
    ? (data.funnel.successfulActionConversations / data.funnel.actionTriggeredConversations) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Conversations"
          value={`${data.summary.totalConversations7d} / ${data.summary.totalConversations30d}`}
          hint="Last 7 days / last 30 days"
          icon={MessageSquare}
          iconClassName="text-blue-500"
          iconBgClassName="bg-blue-500/10"
        />
        <MetricCard
          label="Avg Messages / Conv"
          value={data.summary.averageMessagesPerConversation.toFixed(1)}
          hint="Based on the last 30 days"
          icon={MessageCircleQuestion}
          iconClassName="text-violet-400"
          iconBgClassName="bg-violet-500/10"
        />
        <MetricCard
          label="Avg Response Time"
          value={data.summary.averageResponseTimeSeconds !== null ? `${data.summary.averageResponseTimeSeconds}s` : "n/a"}
          hint="User message to next assistant reply"
          icon={Clock3}
          iconClassName="text-cyan-400"
          iconBgClassName="bg-cyan-500/10"
        />
        <MetricCard
          label="Bounce Rate"
          value={`${data.summary.bounceRate.toFixed(1)}%`}
          hint="Conversations with only one user message"
          icon={Percent}
          iconClassName="text-amber-400"
          iconBgClassName="bg-amber-500/10"
        />
        <MetricCard
          label="Action Triggers"
          value={String(data.summary.actionTriggeredConversations)}
          hint={`${data.summary.leadCaptureConversations} lead capture, ${data.summary.appointmentConversations} appointment`}
          icon={Zap}
          iconClassName="text-kiln-orange"
          iconBgClassName="bg-kiln-orange/10"
        />
        <MetricCard
          label="Action Success Rate"
          value={`${successRate.toFixed(1)}%`}
          hint="Inferred from stored outcomes in the conversation record"
          icon={Target}
          iconClassName="text-emerald-400"
          iconBgClassName="bg-emerald-500/10"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Conversation Quality</h3>
              <p className="mt-1 text-xs text-muted-foreground">Simple volume comparison for the last 7 and 30 days.</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" />
              Last 30 days
            </div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.periodComparison} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#A1A1AA", fontSize: 12 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#A1A1AA", fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: "rgba(249, 115, 22, 0.08)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "#111111",
                    color: "#F5F5F5",
                  }}
                />
                <Bar dataKey="conversations" radius={[8, 8, 0, 0]} fill="#F97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Action Conversion Funnel</h3>
            <p className="mt-1 text-xs text-muted-foreground">Conversation volume to action usage to tracked successful outcomes.</p>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#262626" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#A1A1AA", fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tickLine={false}
                  axisLine={false}
                  width={96}
                  tick={{ fill: "#A1A1AA", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "#111111",
                    color: "#F5F5F5",
                  }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {funnelData.map((entry) => (
                    <Cell key={entry.stage} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Successful outcomes are inferred from tracked signals like captured email, scored lead, or appointment action usage.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Top Topics</h3>
              <p className="mt-1 text-xs text-muted-foreground">Most common opening questions from the last 30 days.</p>
            </div>
            <div className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
              {data.topTopics.length} topics
            </div>
          </div>
          {data.topTopics.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topTopics} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#262626" />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#A1A1AA", fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="topic"
                    width={160}
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
                  />
                  <Bar dataKey="count" radius={[0, 8, 8, 0]} fill="#60A5FA" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
              Not enough conversations yet to identify recurring topics.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Unanswered Questions</h3>
              <p className="mt-1 text-xs text-muted-foreground">Fallback-style replies that likely point to missing knowledge.</p>
            </div>
            <div className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
              {data.unansweredQuestions.length} flagged
            </div>
          </div>

          {data.unansweredQuestions.length > 0 ? (
            <div className="space-y-3">
              {data.unansweredQuestions.map((item) => (
                <div key={`${item.conversationId}-${item.createdAt}`} className="rounded-xl border border-border/80 bg-background/60 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                      <MessageCircleQuestion className="h-4 w-4 text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">User question</p>
                      <p className="mt-1 text-sm text-foreground">{item.question}</p>
                      <div className="mt-3 rounded-lg border border-border/70 bg-muted/30 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Agent fallback</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.response}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-center">
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
                  <BookOpen className="h-5 w-5 text-emerald-400" />
                </div>
                <p className="mt-4 text-sm text-foreground">No obvious fallback answers detected.</p>
                <p className="mt-1 text-xs text-muted-foreground">As the agent sees more conversations, missing knowledge gaps will show up here.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Eval Context</h3>
            <p className="mt-1 text-xs text-muted-foreground">Configured action surface for this agent, based on enabled actions in the agent config.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.configuredActions.length > 0 ? (
              data.configuredActions.map((action) => (
                <span
                  key={action}
                  className="inline-flex items-center gap-1 rounded-full bg-kiln-orange/10 px-2.5 py-1 text-[11px] font-medium text-kiln-orange"
                >
                  <Zap className="h-3 w-3" />
                  {action.replace(/_/g, " ")}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                <AlertCircle className="h-3 w-3" />
                No enabled actions
              </span>
            )}
          </div>
        </div>
      </div>

      {/* AI Suggestions — Eval-to-Fix Loop */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Suggestions</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            AI-detected knowledge gaps with one-click fixes. Edit suggestions before applying.
          </p>
        </div>
        <EvalSuggestions agentId={agentId} />
      </div>
    </div>
  );
}
