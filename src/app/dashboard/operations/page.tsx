"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquare,
  Play,
  Settings,
  UserPlus,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { SkeletonCard, SkeletonStat } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { ModelAnalyticsSection } from "@/components/dashboard/model-analytics-section";
import { CostDashboard } from "@/components/cost/cost-dashboard";

interface OperationsData {
  eligible: boolean;
  agentCount: number;
  overview: {
    totalActiveAgents: number;
    conversationsToday: number;
    conversationsWeek: number;
    leadsToday: number;
    leadsWeek: number;
    creditsRemaining: number;
    totalCredits: number;
    creditsRatio: number;
    agentsNeedingAttention: number;
  };
  dailyActivity: {
    date: string;
    conversations: number;
    leads: number;
  }[];
  attentionItems: {
    id: string;
    entityId: string;
    agentId: string | null;
    agentName: string;
    issueType: string;
    detail: string;
    severity: "warning" | "critical";
    fixHref: string;
  }[];
  activityFeed: {
    id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string;
    href: string;
  }[];
  teams: {
    id: string;
    name: string;
    goal: string | null;
    status: string;
  }[];
  quickLinks: {
    createAgentHref: string;
    conversationsHref: string;
  };
}

function formatRelativeTime(timestamp: string) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case "lead":
      return <UserPlus className="h-4 w-4 text-green-400" />;
    case "appointment":
      return <CalendarCheck2 className="h-4 w-4 text-blue-400" />;
    case "team_execution":
      return <Zap className="h-4 w-4 text-orange-400" />;
    case "handoff":
      return <AlertTriangle className="h-4 w-4 text-amber-300" />;
    case "conversation":
    default:
      return <MessageSquare className="h-4 w-4 text-kiln-orange" />;
  }
}

function OverviewCard({
  label,
  value,
  meta,
  icon,
}: {
  label: string;
  value: string;
  meta: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]">
          {icon}
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
    </div>
  );
}

export default function OperationsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [runningTeamId, setRunningTeamId] = useState<string | null>(null);

  async function fetchOperations(showLoading = false) {
    if (showLoading) setLoading(true);

    try {
      const response = await fetch("/api/dashboard/operations", { cache: "no-store" });
      const nextData = await response.json();
      if (!response.ok) {
        throw new Error(nextData.error || "Failed to load operations data");
      }

      setData(nextData);
      setError(null);

      if (!selectedTeamId && nextData.teams?.[0]?.id) {
        setSelectedTeamId(nextData.teams[0].id);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load operations data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOperations(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchOperations(false);
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  const selectedTeam = useMemo(
    () => data?.teams.find((team) => team.id === selectedTeamId) || null,
    [data?.teams, selectedTeamId]
  );

  const chartData = useMemo(
    () =>
      (data?.dailyActivity || []).map((item) => ({
        ...item,
        label: new Date(item.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      })),
    [data?.dailyActivity]
  );

  async function runSelectedTeam() {
    if (!selectedTeam) return;
    if (!selectedTeam.goal?.trim()) {
      toast("Selected team needs a goal before it can run.", "error");
      return;
    }

    setRunningTeamId(selectedTeam.id);

    try {
      const response = await fetch(`/api/teams/${selectedTeam.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: selectedTeam.goal }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to run team");
      }
      toast(`Team "${selectedTeam.name}" execution started.`);
      await fetchOperations(false);
    } catch (runError) {
      toast(runError instanceof Error ? runError.message : "Failed to run team", "error");
    } finally {
      setRunningTeamId(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="skeleton h-3 w-28 rounded" />
            <div className="skeleton h-7 w-56 rounded" />
            <div className="skeleton h-4 w-72 rounded" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => <SkeletonStat key={i} />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.6fr,1fr]">
          <SkeletonCard className="h-[320px]" />
          <SkeletonCard className="h-[320px]" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
          <SkeletonCard className="h-[240px]" />
          <SkeletonCard className="h-[240px]" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl py-12">
        <ErrorState
          message={error || "Operations-Daten konnten nicht geladen werden."}
          onRetry={() => fetchOperations(true)}
        />
      </div>
    );
  }

  if (!data.eligible) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[28px] border border-border bg-card p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-kiln-orange/10">
            <Activity className="h-8 w-8 text-kiln-orange" />
          </div>
          <h1 className="mt-6 font-serif text-3xl text-foreground">Operations Dashboard</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Operations dashboard unlocks when you have multiple agents.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/dashboard/agents/new">
              <Button className="bg-kiln-orange hover:bg-kiln-orange/90 text-white">
                <Bot className="mr-2 h-4 w-4" />
                Create another agent
              </Button>
            </Link>
            <Link href="/dashboard/agents">
              <Button variant="outline">
                Open AI Agent Studio
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-kiln-orange">
            Agent Operations
          </p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">Global command center</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Monitor conversations, leads, team runs, and weak spots across your entire agent fleet.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          Auto-refreshes every 30 seconds
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <OverviewCard
          label="Active Agents"
          value={String(data.overview.totalActiveAgents)}
          meta={`${data.agentCount} total agents`}
          icon={<Bot className="h-4 w-4 text-kiln-orange" />}
        />
        <OverviewCard
          label="Conversations"
          value={String(data.overview.conversationsWeek)}
          meta={`Today ${data.overview.conversationsToday} · Week to date`}
          icon={<MessageSquare className="h-4 w-4 text-blue-400" />}
        />
        <OverviewCard
          label="Leads Captured"
          value={String(data.overview.leadsWeek)}
          meta={`Today ${data.overview.leadsToday} · Week to date`}
          icon={<UserPlus className="h-4 w-4 text-green-400" />}
        />
        <OverviewCard
          label="Credits Remaining"
          value={String(data.overview.creditsRemaining)}
          meta={`${Math.round(data.overview.creditsRatio * 100)}% of ${data.overview.totalCredits}`}
          icon={<Wallet className="h-4 w-4 text-amber-300" />}
        />
        <OverviewCard
          label="Needs Attention"
          value={String(data.overview.agentsNeedingAttention)}
          meta="Unique agents or workspace issues"
          icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr,1fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Last 7 Days</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Conversations and captured leads across all agents.
              </p>
            </div>
          </div>
          <div className="mt-5 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="operationsConversations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F97316" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="operationsLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
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
                />
                <Area
                  type="monotone"
                  dataKey="conversations"
                  stroke="#F97316"
                  strokeWidth={2}
                  fill="url(#operationsConversations)"
                  name="Conversations"
                />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="#22C55E"
                  strokeWidth={2}
                  fill="url(#operationsLeads)"
                  name="Leads"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Quick Actions</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Move from monitoring into action without leaving the dashboard.
              </p>
            </div>
            <Zap className="h-4 w-4 text-kiln-orange" />
          </div>

          <div className="mt-5 space-y-3">
            <Link
              href={data.quickLinks.createAgentHref}
              className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-3 transition-colors hover:border-kiln-orange/30 hover:bg-kiln-orange/5"
            >
              <div>
                <p className="text-sm font-medium text-foreground">Create new agent</p>
                <p className="mt-1 text-xs text-muted-foreground">Launch a new chat or task agent.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>

            <Link
              href={data.quickLinks.conversationsHref}
              className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-4 py-3 transition-colors hover:border-kiln-orange/30 hover:bg-kiln-orange/5"
            >
              <div>
                <p className="text-sm font-medium text-foreground">View all conversations</p>
                <p className="mt-1 text-xs text-muted-foreground">Open the global conversation inbox across all agents.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>

            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-kiln-orange" />
                <p className="text-sm font-medium text-foreground">Run team</p>
              </div>
              <div className="mt-3 flex gap-2">
                <select
                  value={selectedTeamId}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {data.teams.length === 0 ? (
                    <option value="">No teams available</option>
                  ) : (
                    data.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))
                  )}
                </select>
                <Button
                  onClick={runSelectedTeam}
                  disabled={!selectedTeam || runningTeamId === selectedTeam.id}
                  className="bg-kiln-orange hover:bg-kiln-orange/90 text-white"
                >
                  {runningTeamId === selectedTeam?.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Run"
                  )}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedTeam?.goal
                  ? selectedTeam.goal
                  : "Selected team needs a goal before it can be executed from Operations."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Agents Needing Attention</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Agents or workspace conditions that should be inspected next.
              </p>
            </div>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>

          <div className="mt-5 space-y-3">
            {data.attentionItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-background/30 px-4 py-6 text-center">
                <CheckCircle2 className="mx-auto h-7 w-7 text-green-400" />
                <p className="mt-3 text-sm font-medium text-foreground">No urgent issues detected</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your active agents look healthy across the current attention rules.
                </p>
              </div>
            ) : (
              data.attentionItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3",
                    item.severity === "critical"
                      ? "border-red-500/20 bg-red-500/5"
                      : "border-amber-500/20 bg-amber-500/5"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{item.agentName}</p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                          item.severity === "critical"
                            ? "bg-red-500/15 text-red-300"
                            : "bg-amber-500/15 text-amber-300"
                        )}
                      >
                        {item.issueType}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                  <Link href={item.fixHref}>
                    <Button size="sm" variant="outline" className="whitespace-nowrap">
                      {item.fixHref === "/dashboard/settings" ? (
                        <Settings className="mr-2 h-3.5 w-3.5" />
                      ) : (
                        <ArrowRight className="mr-2 h-3.5 w-3.5" />
                      )}
                      Fix
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Live Activity Feed</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Latest cross-agent events, refreshed automatically.
              </p>
            </div>
            <Activity className="h-4 w-4 text-kiln-orange" />
          </div>

          <div className="mt-5 space-y-3">
            {data.activityFeed.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-background/30 px-4 py-6 text-center">
                <Activity className="mx-auto h-7 w-7 text-zinc-600" />
                <p className="mt-3 text-sm font-medium text-foreground">No recent activity</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  As your agents start working, events will appear here.
                </p>
              </div>
            ) : (
              data.activityFeed.map((event) => (
                <Link
                  key={event.id}
                  href={event.href}
                  className="flex items-start gap-3 rounded-xl border border-border bg-background/30 px-4 py-3 transition-colors hover:border-kiln-orange/20 hover:bg-kiln-orange/5"
                >
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-muted/60">
                    <ActivityIcon type={event.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                  </div>
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Model Analytics & Parallel Execution */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Model Intelligence</p>
        <ModelAnalyticsSection />
      </div>

      {/* Cost Dashboard */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Kosten-Übersicht</p>
        <CostDashboard />
      </div>
    </div>
  );
}
