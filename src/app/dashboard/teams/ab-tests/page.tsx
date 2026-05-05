"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Loader2,
  X,
  FlaskConical,
  Trophy,
  Pause,
  Play,
  Check,
  BarChart3,
  DollarSign,
  Zap,
  Send,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */
interface Team {
  id: string;
  name: string;
}

interface ABTest {
  id: string;
  name: string;
  teamAId: string;
  teamBId: string;
  teamA: Team;
  teamB: Team;
  splitPercentage: number;
  metric: string;
  status: "RUNNING" | "PAUSED" | "COMPLETED";
  maxExecutions: number;
  currentExecutions: number;
  createdAt: string;
  completedAt: string | null;
  _count?: { results: number };
  stats?: TestStats;
  results?: TestResult[];
}

interface TeamStats {
  executions: number;
  completed: number;
  failed: number;
  avgCost: number;
  avgDurationMs: number;
  successRate: number;
  totalCost: number;
}

interface TestStats {
  teamA: TeamStats;
  teamB: TeamStats;
  winner: "A" | "B" | "TIE" | "INSUFFICIENT_DATA";
  confidence: number;
  metric: string;
}

interface TestResult {
  id: string;
  team: "A" | "B";
  status: string;
  cost: number | null;
  durationMs: number | null;
  createdAt: string;
}

const metricLabels: Record<string, { label: string; icon: typeof BarChart3 }> = {
  completion_rate: { label: "Completion Rate", icon: Check },
  cost: { label: "Cost Efficiency", icon: DollarSign },
  speed: { label: "Speed", icon: Zap },
  lead_quality: { label: "Lead Quality", icon: Target },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  RUNNING: { bg: "bg-green-500/20", text: "text-muted-foreground" },
  PAUSED: { bg: "bg-amber-500/20", text: "text-muted-foreground" },
  COMPLETED: { bg: "bg-muted/20", text: "text-muted-foreground" },
};

export default function ABTestsPage() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [detailTest, setDetailTest] = useState<ABTest | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [split, setSplit] = useState(50);
  const [metric, setMetric] = useState("completion_rate");
  const [maxExec, setMaxExec] = useState(100);
  const [creating, setCreating] = useState(false);

  // Execute form
  const [showExecute, setShowExecute] = useState<string | null>(null);
  const [executeGoal, setExecuteGoal] = useState("");
  const [executing, setExecuting] = useState(false);

  const fetchTests = useCallback(async () => {
    try {
      const res = await fetch("/api/teams/ab-tests");
      if (res.ok) setTests(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/teams");
      if (res.ok) {
        const data = await res.json();
        setTeams(data.map((t: Team) => ({ id: t.id, name: t.name })));
      }
    } catch {
      // noop
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/teams/ab-tests/${id}`);
      if (res.ok) setDetailTest(await res.json());
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    fetchTests();
    fetchTeams();
  }, [fetchTests, fetchTeams]);

  useEffect(() => {
    if (selectedTestId) fetchDetail(selectedTestId);
  }, [selectedTestId, fetchDetail]);

  const createTest = async () => {
    if (!name || !teamAId || !teamBId || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/teams/ab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, teamAId, teamBId, splitPercentage: split, metric, maxExecutions: maxExec }),
      });
      if (res.ok) {
        setShowCreate(false);
        setName("");
        setTeamAId("");
        setTeamBId("");
        setSplit(50);
        setMetric("completion_rate");
        setMaxExec(100);
        await fetchTests();
      }
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/teams/ab-tests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      await fetchTests();
      if (selectedTestId === id) await fetchDetail(id);
    }
  };

  const executeTest = async (id: string) => {
    if (!executeGoal.trim() || executing) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/teams/ab-tests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: executeGoal.trim() }),
      });
      if (res.ok) {
        setShowExecute(null);
        setExecuteGoal("");
        await fetchTests();
        if (selectedTestId === id) await fetchDetail(id);
      }
    } finally {
      setExecuting(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/teams" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2 font-[family-name:var(--font-instrument)]">
            <FlaskConical className="h-5 w-5 text-orange-400" />
            A/B Tests
          </h1>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          className="bg-orange-600 hover:bg-orange-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Test
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Test List */}
        <div className={cn("border-r border-border overflow-y-auto", selectedTestId ? "w-[360px]" : "flex-1 max-w-3xl mx-auto")}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FlaskConical className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm mb-2">No A/B tests yet</p>
              <p className="text-xs text-muted-foreground">Compare two workflow configurations to find the best performer</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {tests.map((test) => {
                const progress = test.maxExecutions > 0
                  ? Math.round((test.currentExecutions / test.maxExecutions) * 100)
                  : 0;
                const sc = statusColors[test.status] || statusColors.COMPLETED;
                const mc = metricLabels[test.metric] || metricLabels.completion_rate;
                const MetricIcon = mc.icon;

                return (
                  <div
                    key={test.id}
                    onClick={() => setSelectedTestId(test.id)}
                    className={cn(
                      "px-4 py-3 cursor-pointer hover:bg-card/50 transition-colors",
                      selectedTestId === test.id && "bg-card/80 border-l-2 border-orange-500"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-medium text-sm text-foreground truncate">{test.name}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", sc.bg, sc.text)}>
                        {test.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2">
                      <span>{test.teamA.name} vs {test.teamB.name}</span>
                      <span className="flex items-center gap-1">
                        <MetricIcon className="h-3 w-3" />
                        {mc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground min-w-[50px] text-right">
                        {test.currentExecutions}/{test.maxExecutions}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-2">
                      {test.status === "RUNNING" && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowExecute(test.id); }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                          >
                            Run Execution
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); updateStatus(test.id, "PAUSED"); }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground hover:bg-muted"
                          >
                            <Pause className="h-2.5 w-2.5 inline mr-0.5" /> Pause
                          </button>
                        </>
                      )}
                      {test.status === "PAUSED" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(test.id, "RUNNING"); }}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground hover:bg-green-500/20"
                        >
                          <Play className="h-2.5 w-2.5 inline mr-0.5" /> Resume
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedTestId && (
          <div className="flex-1 overflow-y-auto">
            {loadingDetail ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : detailTest ? (
              <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground font-[family-name:var(--font-instrument)]">
                      {detailTest.name}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {detailTest.teamA.name} vs {detailTest.teamB.name} — {detailTest.splitPercentage}/{100 - detailTest.splitPercentage} split
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailTest.status === "RUNNING" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateStatus(detailTest.id, "PAUSED")} className="text-muted-foreground">
                          <Pause className="h-3.5 w-3.5 mr-1" /> Pause
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateStatus(detailTest.id, "COMPLETED")} className="text-muted-foreground">
                          <Check className="h-3.5 w-3.5 mr-1" /> Complete
                        </Button>
                      </>
                    )}
                    {detailTest.status === "PAUSED" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(detailTest.id, "RUNNING")} className="text-muted-foreground">
                        <Play className="h-3.5 w-3.5 mr-1" /> Resume
                      </Button>
                    )}
                    <button onClick={() => { setSelectedTestId(null); setDetailTest(null); }} className="text-muted-foreground hover:text-foreground p-1">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Progress */}
                <div className="rounded-xl border border-border bg-card/60 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Progress</span>
                    <span className="text-sm text-foreground">
                      {detailTest.currentExecutions} / {detailTest.maxExecutions} executions
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all"
                      style={{ width: `${Math.round((detailTest.currentExecutions / detailTest.maxExecutions) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Winner Banner */}
                {detailTest.stats && detailTest.stats.winner !== "INSUFFICIENT_DATA" && (
                  <div className={cn(
                    "rounded-xl border p-4 flex items-center gap-3",
                    detailTest.stats.winner === "TIE"
                      ? "border-border bg-card/60"
                      : "border-orange-500/30 bg-orange-500/5"
                  )}>
                    <Trophy className={cn("h-5 w-5", detailTest.stats.winner === "TIE" ? "text-muted-foreground" : "text-orange-400")} />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {detailTest.stats.winner === "TIE"
                          ? "Currently a tie"
                          : `Workflow ${detailTest.stats.winner} (${detailTest.stats.winner === "A" ? detailTest.teamA.name : detailTest.teamB.name}) is winning`
                        }
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Confidence: {Math.round(detailTest.stats.confidence * 100)}%
                        {detailTest.stats.confidence < 0.7 && " — needs more data"}
                      </p>
                    </div>
                    {detailTest.status !== "COMPLETED" && detailTest.stats.confidence >= 0.8 && detailTest.stats.winner !== "TIE" && (
                      <Button
                        size="sm"
                        onClick={() => updateStatus(detailTest.id, "COMPLETED")}
                        className="ml-auto bg-orange-600 hover:bg-orange-700 text-white"
                      >
                        <Trophy className="h-3.5 w-3.5 mr-1" />
                        Declare Winner
                      </Button>
                    )}
                  </div>
                )}

                {/* Side-by-side comparison */}
                {detailTest.stats && (
                  <div className="grid grid-cols-2 gap-4">
                    {(["A", "B"] as const).map((side) => {
                      const stats = side === "A" ? detailTest.stats!.teamA : detailTest.stats!.teamB;
                      const teamName = side === "A" ? detailTest.teamA.name : detailTest.teamB.name;
                      const isWinner = detailTest.stats!.winner === side;

                      return (
                        <div
                          key={side}
                          className={cn(
                            "rounded-xl border p-4 space-y-3",
                            isWinner ? "border-orange-500/40 bg-orange-500/5" : "border-border bg-card/60"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground flex items-center gap-2">
                              Workflow {side}
                              {isWinner && <Trophy className="h-3.5 w-3.5 text-orange-400" />}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{teamName}</span>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-background/50 p-2.5">
                              <div className="text-[10px] text-muted-foreground mb-1">Success Rate</div>
                              <div className="text-lg font-bold text-foreground">
                                {(stats.successRate * 100).toFixed(1)}%
                              </div>
                            </div>
                            <div className="rounded-lg bg-background/50 p-2.5">
                              <div className="text-[10px] text-muted-foreground mb-1">Executions</div>
                              <div className="text-lg font-bold text-foreground">{stats.executions}</div>
                            </div>
                            <div className="rounded-lg bg-background/50 p-2.5">
                              <div className="text-[10px] text-muted-foreground mb-1">Avg Cost</div>
                              <div className="text-lg font-bold text-foreground">
                                {formatCost(stats.avgCost)}
                              </div>
                            </div>
                            <div className="rounded-lg bg-background/50 p-2.5">
                              <div className="text-[10px] text-muted-foreground mb-1">Avg Duration</div>
                              <div className="text-lg font-bold text-foreground">
                                {formatDuration(stats.avgDurationMs)}
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-border/50">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">Total Cost</span>
                              <span className="text-foreground">{formatCost(stats.totalCost)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] mt-1">
                              <span className="text-muted-foreground">Completed / Failed</span>
                              <span className="text-foreground">{stats.completed} / {stats.failed}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Comparison bars */}
                {detailTest.stats && detailTest.stats.teamA.executions > 0 && (
                  <div className="rounded-xl border border-border bg-card/60 p-4 space-y-4">
                    <h3 className="text-sm font-medium text-foreground">Comparison</h3>

                    {[
                      { label: "Success Rate", a: detailTest.stats.teamA.successRate * 100, b: detailTest.stats.teamB.successRate * 100, unit: "%", higherBetter: true },
                      { label: "Avg Cost", a: detailTest.stats.teamA.avgCost * 10000, b: detailTest.stats.teamB.avgCost * 10000, unit: "", higherBetter: false },
                      { label: "Avg Speed", a: detailTest.stats.teamA.avgDurationMs, b: detailTest.stats.teamB.avgDurationMs, unit: "", higherBetter: false },
                    ].map((item) => {
                      const max = Math.max(item.a, item.b, 0.001);
                      return (
                        <div key={item.label}>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                            <span>{item.label}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground w-16">Workflow A</span>
                              <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    (item.higherBetter ? item.a >= item.b : item.a <= item.b)
                                      ? "bg-green-500/70"
                                      : "bg-muted"
                                  )}
                                  style={{ width: `${(item.a / max) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground w-16">Workflow B</span>
                              <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    (item.higherBetter ? item.b >= item.a : item.b <= item.a)
                                      ? "bg-green-500/70"
                                      : "bg-muted"
                                  )}
                                  style={{ width: `${(item.b / max) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Recent Results */}
                {detailTest.results && detailTest.results.length > 0 && (
                  <div className="rounded-xl border border-border bg-card/60 p-4">
                    <h3 className="text-sm font-medium text-foreground mb-3">Recent Executions</h3>
                    <div className="space-y-1.5">
                      {detailTest.results.slice(0, 20).map((result) => (
                        <div key={result.id} className="flex items-center gap-3 text-[11px] px-2 py-1.5 rounded-lg hover:bg-muted/50">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded font-mono",
                            result.team === "A" ? "bg-blue-500/20 text-muted-foreground" : "bg-purple-500/20 text-muted-foreground"
                          )}>
                            {result.team}
                          </span>
                          <span className={cn(
                            result.status === "COMPLETED" ? "text-muted-foreground" :
                            result.status === "FAILED" ? "text-muted-foreground" :
                            result.status === "RUNNING" ? "text-muted-foreground" : "text-muted-foreground"
                          )}>
                            {result.status}
                          </span>
                          {result.cost != null && (
                            <span className="text-muted-foreground">{formatCost(result.cost)}</span>
                          )}
                          {result.durationMs != null && (
                            <span className="text-muted-foreground">{formatDuration(result.durationMs)}</span>
                          )}
                          <span className="ml-auto text-muted-foreground">
                            {new Date(result.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 font-[family-name:var(--font-instrument)]">
                <FlaskConical className="h-5 w-5 text-orange-400" />
                New A/B Test
              </h2>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Test Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Support Workflow v2 vs v1"
                  className="w-full bg-muted/60 border border-border rounded-xl text-sm text-foreground outline-none px-3 py-2 placeholder:text-muted-foreground focus:border-orange-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Workflow A</label>
                  <select
                    value={teamAId}
                    onChange={(e) => setTeamAId(e.target.value)}
                    className="w-full bg-muted/60 border border-border rounded-xl text-sm text-foreground outline-none px-3 py-2"
                  >
                    <option value="">Select workflow...</option>
                    {teams.filter((t) => t.id !== teamBId).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Workflow B</label>
                  <select
                    value={teamBId}
                    onChange={(e) => setTeamBId(e.target.value)}
                    className="w-full bg-muted/60 border border-border rounded-xl text-sm text-foreground outline-none px-3 py-2"
                  >
                    <option value="">Select workflow...</option>
                    {teams.filter((t) => t.id !== teamAId).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Split Percentage (Workflow A : Workflow B)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={5}
                    value={split}
                    onChange={(e) => setSplit(Number(e.target.value))}
                    className="flex-1 accent-orange-500"
                  />
                  <span className="text-sm text-foreground min-w-[60px] text-right font-mono">
                    {split}/{100 - split}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Success Metric</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(metricLabels).map(([key, val]) => {
                    const Icon = val.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => setMetric(key)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors",
                          metric === key
                            ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {val.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Max Executions</label>
                <input
                  type="number"
                  value={maxExec}
                  onChange={(e) => setMaxExec(Math.max(10, Number(e.target.value)))}
                  min={10}
                  max={10000}
                  className="w-full bg-muted/60 border border-border rounded-xl text-sm text-foreground outline-none px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} className="text-muted-foreground">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={createTest}
                disabled={creating || !name || !teamAId || !teamBId}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FlaskConical className="h-4 w-4 mr-1" />}
                Create Test
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Execute Modal */}
      {showExecute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground font-[family-name:var(--font-instrument)]">
                Run A/B Test Execution
              </h2>
              <button onClick={() => { setShowExecute(null); setExecuteGoal(""); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              The execution will be randomly routed to Workflow A or Workflow B based on the split percentage.
            </p>
            <textarea
              autoFocus
              placeholder="Enter the goal for this execution..."
              value={executeGoal}
              onChange={(e) => setExecuteGoal(e.target.value)}
              rows={3}
              className="w-full bg-muted/60 border border-border rounded-xl text-sm text-foreground outline-none p-3 placeholder:text-muted-foreground resize-none focus:border-orange-500/50"
            />
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="ghost" size="sm" onClick={() => { setShowExecute(null); setExecuteGoal(""); }} className="text-muted-foreground">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => executeTest(showExecute)}
                disabled={executing || !executeGoal.trim()}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {executing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                Execute
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
