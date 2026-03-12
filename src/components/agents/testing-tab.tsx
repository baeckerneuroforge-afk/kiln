"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Loader2,
  Trash2,
  Play,
  X,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TestCase {
  id: string;
  name: string;
  inputMessage: string;
  expectedKeywords: string[];
  lastResult: string | null;
  lastResponse: string | null;
  lastRunAt: string | null;
  createdAt: string;
}

interface TestRun {
  id: string;
  totalTests: number;
  passed: number;
  failed: number;
  score: number;
  runAt: string;
}

interface RunResult {
  id: string;
  result: string;
  response: string;
  matchedKeywords: string[];
  missedKeywords: string[];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  agentId: string;
  prefill?: { input: string; response: string } | null;
  onPrefillConsumed?: () => void;
}

export function TestingTab({ agentId, prefill, onPrefillConsumed }: Props) {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formInput, setFormInput] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill from Logs tab — auto-open modal with pre-filled data
  useEffect(() => {
    if (prefill) {
      // Erste 3-5 signifikante Wörter aus der Response als Keywords extrahieren
      const words = prefill.response
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5);
      setFormName("Test from conversation");
      setFormInput(prefill.input);
      setFormKeywords(words.join(", "));
      setShowModal(true);
      onPrefillConsumed?.();
    }
  }, [prefill, onPrefillConsumed]);

  async function fetchData() {
    try {
      const [casesRes, runsRes] = await Promise.all([
        fetch(`/api/agents/${agentId}/tests`),
        fetch(`/api/agents/${agentId}/tests?type=runs`),
      ]);
      if (casesRes.ok) setTestCases(await casesRes.json());
      if (runsRes.ok) setTestRuns(await runsRes.json());
    } catch {
      // Fehler
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!formName.trim() || !formInput.trim() || !formKeywords.trim()) return;
    setCreating(true);

    const keywords = formKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/agents/${agentId}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: formName.trim(),
          inputMessage: formInput.trim(),
          expectedKeywords: keywords,
        }),
      });
      if (res.ok) {
        const newCase = await res.json();
        setTestCases((prev) => [...prev, newCase]);
        setFormName("");
        setFormInput("");
        setFormKeywords("");
        setShowModal(false);
      }
    } catch {
      // Fehler
    } finally {
      setCreating(false);
    }
  }

  async function handleRunAll() {
    if (testCases.length === 0) return;
    setRunning(true);
    setRunResults(null);

    try {
      const res = await fetch(`/api/agents/${agentId}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      if (res.ok) {
        const data = await res.json();
        setRunResults(data.results);

        // Test Cases mit neuen Ergebnissen aktualisieren
        setTestCases((prev) =>
          prev.map((tc) => {
            const result = data.results.find((r: RunResult) => r.id === tc.id);
            if (result) {
              return {
                ...tc,
                lastResult: result.result,
                lastResponse: result.response,
                lastRunAt: new Date().toISOString(),
              };
            }
            return tc;
          })
        );

        // Runs neu laden
        const runsRes = await fetch(`/api/agents/${agentId}/tests?type=runs`);
        if (runsRes.ok) setTestRuns(await runsRes.json());
      }
    } catch {
      // Fehler
    } finally {
      setRunning(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/tests?testCaseId=${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setTestCases((prev) => prev.filter((tc) => tc.id !== id));
      }
    } catch {
      // Fehler
    } finally {
      setDeleting(null);
    }
  }

  // Score-Statistiken
  const passedCount = testCases.filter((tc) => tc.lastResult === "PASS").length;
  const failedCount = testCases.filter((tc) => tc.lastResult === "FAIL").length;
  const untestedCount = testCases.filter((tc) => !tc.lastResult).length;

  // Chart-Daten (älteste zuerst)
  const chartData = [...testRuns]
    .reverse()
    .slice(-20)
    .map((run) => ({
      date: new Date(run.runAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: Math.round(run.score * 100),
      passed: run.passed,
      failed: run.failed,
    }));

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Testing Suite</h2>
          <p className="text-sm text-muted-foreground">
            Define test cases and validate your agent&apos;s responses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFormName("");
              setFormInput("");
              setFormKeywords("");
              setShowModal(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Test Case
          </Button>
          <Button
            size="sm"
            onClick={handleRunAll}
            disabled={running || testCases.length === 0}
          >
            {running ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            Run All Tests
          </Button>
        </div>
      </div>

      {/* Score Summary */}
      {testCases.length > 0 && (passedCount > 0 || failedCount > 0) && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
            <p className="text-2xl font-bold text-foreground">
              {passedCount + failedCount > 0
                ? `${Math.round((passedCount / (passedCount + failedCount)) * 100)}%`
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Score</p>
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{passedCount}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{failedCount}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{untestedCount}</p>
            <p className="text-xs text-muted-foreground">Untested</p>
          </div>
        </div>
      )}

      {/* Score Over Time Chart */}
      {chartData.length >= 2 && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Score Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#78716C", fontSize: 10 }}
                stroke="#292524"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#78716C", fontSize: 10 }}
                stroke="#292524"
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1C1917",
                  border: "1px solid #292524",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#A8A29E" }}
                formatter={(value) => [`${value}%`, "Score"]}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#22C55E"
                strokeWidth={2}
                dot={{ fill: "#22C55E", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Test Cases List */}
      {testCases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <FlaskConical className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No test cases yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add test cases to validate your agent&apos;s responses.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {testCases.map((tc) => {
            const isExpanded = expandedId === tc.id;
            const result = runResults?.find((r) => r.id === tc.id);

            return (
              <div
                key={tc.id}
                className={cn(
                  "rounded-xl border overflow-hidden",
                  tc.lastResult === "PASS"
                    ? "border-green-500/20 bg-card/50"
                    : tc.lastResult === "FAIL"
                    ? "border-red-500/20 bg-card/50"
                    : "border-border bg-card/50"
                )}
              >
                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Status icon */}
                  <div className="shrink-0">
                    {tc.lastResult === "PASS" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                    ) : tc.lastResult === "FAIL" ? (
                      <XCircle className="h-5 w-5 text-red-400" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {tc.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      &quot;{tc.inputMessage}&quot;
                    </p>
                  </div>

                  {/* Keywords count */}
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {(tc.expectedKeywords as string[]).length} keyword{(tc.expectedKeywords as string[]).length !== 1 ? "s" : ""}
                  </span>

                  {/* Last run */}
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDate(tc.lastRunAt)}
                  </span>

                  {/* Expand */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : tc.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(tc.id)}
                    disabled={deleting === tc.id}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  >
                    {deleting === tc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        Input Message
                      </p>
                      <p className="text-xs text-foreground">{tc.inputMessage}</p>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        Expected Keywords
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(tc.expectedKeywords as string[]).map((kw, i) => {
                          const matched = result
                            ? result.matchedKeywords.some((m) => m.toLowerCase() === kw.toLowerCase())
                            : null;
                          return (
                            <span
                              key={i}
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                                matched === true
                                  ? "bg-green-500/10 text-green-400"
                                  : matched === false
                                  ? "bg-red-500/10 text-red-400"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {kw}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {tc.lastResponse && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                          Last Response
                        </p>
                        <div
                          className={cn(
                            "rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto",
                            tc.lastResponse.startsWith("ERROR")
                              ? "border-red-500/20 bg-red-500/5 text-red-400"
                              : "border-border bg-card text-foreground"
                          )}
                        >
                          {tc.lastResponse.slice(0, 1000)}
                          {tc.lastResponse.length > 1000 && "..."}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Run summary after test execution */}
      {runResults && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Test Run Complete
          </h3>
          <p className="text-xs text-muted-foreground">
            {runResults.filter((r) => r.result === "PASS").length}/{runResults.length} passed
            {" — "}
            {runResults.length > 0
              ? Math.round(
                  (runResults.filter((r) => r.result === "PASS").length / runResults.length) * 100
                )
              : 0}
            %
          </p>
        </div>
      )}

      {/* Add Test Case Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-[#1C1917] p-6 shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-foreground">Add Test Case</h3>
              <button
                onClick={() => setShowModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Test Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Pricing question"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Input Message
                </label>
                <textarea
                  value={formInput}
                  onChange={(e) => setFormInput(e.target.value)}
                  rows={3}
                  placeholder="What would the user ask?"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Expected Keywords
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (comma-separated)
                  </span>
                </label>
                <input
                  type="text"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  placeholder="e.g. pricing, $49, monthly"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  The agent&apos;s response must contain ALL keywords to pass.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={creating || !formName.trim() || !formInput.trim() || !formKeywords.trim()}
              >
                {creating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Add Test Case
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
