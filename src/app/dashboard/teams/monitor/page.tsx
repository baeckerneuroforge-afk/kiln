"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Radio,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonStat, SkeletonRow } from "@/components/ui/skeleton";

interface MonitorExecution {
  id: string;
  teamId: string;
  teamName: string;
  status: string;
  goal: string | null;
  startedAt: string;
  completedAt: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  elapsedMs: number;
  currentAgent: { id: string; name: string } | null;
  currentStep: string | null;
  currentStepIndex: number;
  costSoFar: number;
  priority?: number;
  queuePosition?: number | null;
  pendingApprovals: {
    id: string;
    token: string;
    taskIndex: number;
    approverEmail: string | null;
    requestedAt: string;
  }[];
}

interface MonitorData {
  summary: {
    runningNow: number;
    queuedNow: number;
    awaitingApproval: number;
    completedToday: number;
    failedToday: number;
  };
  executions: MonitorExecution[];
  hourlyTimeline: { hour: string; completed: number; failed: number; running: number }[];
}

type StatusFilter = "all" | "RUNNING" | "QUEUED" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED";

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

const PRIORITY_BADGE: Record<number, { label: string; style: string }> = {
  0: { label: "Critical", style: "border-red-500/40 bg-red-500/15 text-red-300" },
  1: { label: "High", style: "border-orange-500/40 bg-orange-500/15 text-orange-300" },
  2: { label: "Normal", style: "border-zinc-600 bg-zinc-800/80 text-zinc-400" },
  3: { label: "Low", style: "border-blue-500/40 bg-blue-500/15 text-blue-300" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  RUNNING: { label: "Running", color: "text-blue-400 bg-blue-500/10 border-blue-500/20", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  AWAITING_APPROVAL: { label: "Awaiting Approval", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: <Pause className="h-3.5 w-3.5" /> },
  COMPLETED: { label: "Completed", color: "text-green-400 bg-green-500/10 border-green-500/20", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  PARTIAL: { label: "Partial", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  FAILED: { label: "Failed", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: <XCircle className="h-3.5 w-3.5" /> },
  QUEUED: { label: "Queued", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", icon: <Clock className="h-3.5 w-3.5" /> },
};

export default function TeamMonitorPage() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/teams/monitor");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefresh(new Date());
      }
    } catch {
      // Fehler still behandeln
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonStat key={i} />)}
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="rounded-xl border border-border overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-zinc-500">Failed to load monitor data.</p>
      </div>
    );
  }

  // Unique team names for filter
  const teamNames = Array.from(new Set(data.executions.map((e) => e.teamName))).sort();

  // Filter
  const filtered = data.executions.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (teamFilter !== "all" && e.teamName !== teamFilter) return false;
    return true;
  });

  // Max in timeline for bar heights
  const maxTimeline = Math.max(1, ...data.hourlyTimeline.map((h) => h.completed + h.failed + h.running));

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/teams" className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-zinc-100 font-[family-name:var(--font-instrument)] flex items-center gap-2">
                <Radio className="h-5 w-5 text-orange-400" />
                Workflow Monitor
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Live overview of all workflow executions · Auto-refreshes every 5s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600">
              Updated {lastRefresh.toLocaleTimeString("de-DE")}
            </span>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-4">
          <button
            onClick={() => setStatusFilter(statusFilter === "RUNNING" ? "all" : "RUNNING")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              statusFilter === "RUNNING"
                ? "border-blue-500/30 bg-blue-500/10"
                : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Running Now</span>
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <p className="mt-2 text-3xl font-bold text-zinc-100">{data.summary.runningNow}</p>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === "QUEUED" ? "all" : "QUEUED")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              statusFilter === "QUEUED"
                ? "border-cyan-500/30 bg-cyan-500/10"
                : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Queued</span>
              <Clock className="h-4 w-4 text-cyan-400" />
            </div>
            <p className="mt-2 text-3xl font-bold text-zinc-100">{data.summary.queuedNow || 0}</p>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === "AWAITING_APPROVAL" ? "all" : "AWAITING_APPROVAL")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              statusFilter === "AWAITING_APPROVAL"
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Awaiting Approval</span>
              <Pause className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-2 text-3xl font-bold text-zinc-100">{data.summary.awaitingApproval}</p>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === "COMPLETED" ? "all" : "COMPLETED")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              statusFilter === "COMPLETED"
                ? "border-green-500/30 bg-green-500/10"
                : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Completed Today</span>
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            </div>
            <p className="mt-2 text-3xl font-bold text-zinc-100">{data.summary.completedToday}</p>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === "FAILED" ? "all" : "FAILED")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              statusFilter === "FAILED"
                ? "border-red-500/30 bg-red-500/10"
                : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Failed Today</span>
              <XCircle className="h-4 w-4 text-red-400" />
            </div>
            <p className="mt-2 text-3xl font-bold text-zinc-100">{data.summary.failedToday}</p>
          </button>
        </div>

        {/* Timeline Chart */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h3 className="text-sm font-semibold text-zinc-200 mb-4">Last 24 Hours</h3>
          <div className="flex items-end gap-[3px] h-20">
            {data.hourlyTimeline.map((bucket, i) => {
              const total = bucket.completed + bucket.failed + bucket.running;
              const heightPercent = total > 0 ? (total / maxTimeline) * 100 : 2;
              const failedPercent = total > 0 ? (bucket.failed / total) * 100 : 0;
              const runningPercent = total > 0 ? (bucket.running / total) * 100 : 0;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end group relative"
                  title={`${bucket.hour}: ${bucket.completed} completed, ${bucket.failed} failed, ${bucket.running} running`}
                >
                  <div
                    className="w-full rounded-sm overflow-hidden transition-all hover:opacity-80"
                    style={{ height: `${heightPercent}%`, minHeight: "2px" }}
                  >
                    {failedPercent > 0 && (
                      <div className="bg-red-500" style={{ height: `${failedPercent}%` }} />
                    )}
                    {runningPercent > 0 && (
                      <div className="bg-blue-500" style={{ height: `${runningPercent}%` }} />
                    )}
                    <div className="bg-green-500 flex-1" style={{ height: `${100 - failedPercent - runningPercent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5 text-[9px] text-zinc-600">
            <span>{data.hourlyTimeline[0]?.hour || ""}</span>
            <span>{data.hourlyTimeline[Math.floor(data.hourlyTimeline.length / 2)]?.hour || ""}</span>
            <span>{data.hourlyTimeline[data.hourlyTimeline.length - 1]?.hour || ""}</span>
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />Completed</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />Running</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Failed</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 focus:border-orange-500 focus:outline-none"
          >
            <option value="all">All Workflows</option>
            {teamNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {(statusFilter !== "all" || teamFilter !== "all") && (
            <button
              onClick={() => { setStatusFilter("all"); setTeamFilter("all"); }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto text-[10px] text-zinc-600">
            {filtered.length} execution{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Execution Feed */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
              <Radio className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400">No executions matching your filters</p>
            </div>
          ) : (
            filtered.map((exec) => {
              const status = STATUS_CONFIG[exec.status] || STATUS_CONFIG.FAILED;
              const progress = exec.totalTasks > 0
                ? Math.round(((exec.completedTasks + exec.failedTasks) / exec.totalTasks) * 100)
                : 0;
              const isRunning = exec.status === "RUNNING";
              const isWaiting = exec.status === "AWAITING_APPROVAL";

              return (
                <Link
                  key={exec.id}
                  href={`/dashboard/teams/${exec.teamId}?execution=${exec.id}`}
                  className={cn(
                    "block rounded-xl border bg-zinc-900/60 p-4 transition-all hover:border-zinc-600",
                    isRunning ? "border-blue-500/20" : isWaiting ? "border-amber-500/20" : "border-zinc-800"
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Status + Team */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", status.color)}>
                          {status.icon}
                          {status.label}
                        </span>
                        {typeof exec.priority === "number" && exec.priority !== 2 && (
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", PRIORITY_BADGE[exec.priority]?.style || PRIORITY_BADGE[2].style)}>
                            {PRIORITY_BADGE[exec.priority]?.label || "Normal"}
                          </span>
                        )}
                        <span className="text-sm font-medium text-zinc-200">{exec.teamName}</span>
                      </div>

                      {exec.goal && (
                        <p className="text-xs text-zinc-500 truncate mb-2">{exec.goal}</p>
                      )}

                      {/* Current step + agent */}
                      {(isRunning || isWaiting) && exec.currentStep && (
                        <div className="flex items-center gap-2 mb-2">
                          {isRunning && exec.currentAgent && (
                            <span className="flex items-center gap-1.5 text-xs text-blue-400">
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                              </span>
                              {exec.currentAgent.name}
                            </span>
                          )}
                          <span className="text-xs text-zinc-500">
                            Step {exec.currentStepIndex + 1}/{exec.totalTasks}: {exec.currentStep}
                          </span>
                        </div>
                      )}

                      {/* Progress bar */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              exec.failedTasks > 0 && exec.completedTasks === 0 ? "bg-red-500" :
                              exec.failedTasks > 0 ? "bg-amber-500" :
                              isRunning ? "bg-blue-500" : "bg-green-500"
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-500 shrink-0">
                          {exec.completedTasks}/{exec.totalTasks} tasks
                        </span>
                      </div>
                    </div>

                    {/* Right side: elapsed + cost */}
                    <div className="text-right shrink-0 space-y-1">
                      <div className="flex items-center gap-1 text-xs text-zinc-400 justify-end">
                        <Clock className="h-3 w-3" />
                        {formatElapsed(exec.elapsedMs)}
                      </div>
                      {exec.costSoFar > 0 && (
                        <p className="text-[10px] text-zinc-500">{formatCost(exec.costSoFar)}</p>
                      )}
                    </div>
                  </div>

                  {/* Inline Approve for awaiting approval */}
                  {isWaiting && exec.pendingApprovals.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-2">
                      <Pause className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-xs text-amber-400 flex-1">
                        Approval required
                        {exec.pendingApprovals[0].approverEmail ? ` from ${exec.pendingApprovals[0].approverEmail}` : ""}
                      </span>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(`/approve/${exec.teamId}/${exec.id}/${exec.pendingApprovals[0].token}`, "_blank");
                        }}
                        className="bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Review
                      </Button>
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
