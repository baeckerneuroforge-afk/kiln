"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  Clock3,
  CopyCheck,
  Equal,
  Loader2,
  RefreshCw,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALL_MODELS, getModelDef, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

type Winner = "A" | "B" | "SAME" | null;

type CompareConfig = {
  systemPrompt: string;
  llmModel: string;
  modelProvider: string;
  temperature: number;
};

type CompareResponse = {
  text: string;
  responseTimeMs: number;
  tokenCount: number | null;
  model: string;
  provider: string;
};

type ComparisonRecord = {
  id: string;
  message: string;
  createdAt: string;
  winner: Winner;
  configA: CompareConfig;
  configB: CompareConfig;
  responseA: CompareResponse;
  responseB: CompareResponse;
};

type HistoryRecord = {
  id: string;
  message: string;
  createdAt: string;
  winner: Winner;
  configA: CompareConfig;
  configB: CompareConfig;
  responseA: string;
  responseB: string;
  responseTimeA: number | null;
  responseTimeB: number | null;
  tokenCountA: number | null;
  tokenCountB: number | null;
};

type Summary = {
  total: number;
  winnerA: number;
  winnerB: number;
  winnerSame: number;
  unrated: number;
};

interface Props {
  agentId: string;
  currentConfig: CompareConfig;
  onApplyVersion: (config: CompareConfig) => Promise<void>;
}

const emptySummary: Summary = {
  total: 0,
  winnerA: 0,
  winnerB: 0,
  winnerSame: 0,
  unrated: 0,
};

function formatResponseTime(ms: number | null | undefined) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatTokens(tokens: number | null | undefined) {
  if (typeof tokens !== "number" || !Number.isFinite(tokens)) return "—";
  return tokens.toLocaleString("en-US");
}

function formatRelativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.max(1, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function normalizeHistoryRecord(item: HistoryRecord): ComparisonRecord {
  return {
    id: item.id,
    message: item.message,
    createdAt: item.createdAt,
    winner: item.winner,
    configA: item.configA,
    configB: item.configB,
    responseA: {
      text: item.responseA,
      responseTimeMs: item.responseTimeA || 0,
      tokenCount: item.tokenCountA,
      model: item.configA.llmModel,
      provider: item.configA.modelProvider,
    },
    responseB: {
      text: item.responseB,
      responseTimeMs: item.responseTimeB || 0,
      tokenCount: item.tokenCountB,
      model: item.configB.llmModel,
      provider: item.configB.modelProvider,
    },
  };
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-card/60 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={cn("mt-3 text-2xl font-semibold", accent)}>{value}</p>
    </div>
  );
}

function ResponseCard({
  title,
  response,
  tone,
}: {
  title: string;
  response: CompareResponse | null;
  tone: "orange" | "blue";
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-4",
      tone === "orange"
        ? "border-kiln-orange/20 bg-kiln-orange/5"
        : "border-blue-500/20 bg-blue-500/5"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {response ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {getModelDef(response.model)?.label || response.model}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Run a shared message to generate a response.</p>
          )}
        </div>
        {response && (
          <div className="grid grid-cols-2 gap-2 text-right text-[11px] text-muted-foreground">
            <span>Time</span>
            <span className="text-foreground">{formatResponseTime(response.responseTimeMs)}</span>
            <span>Tokens</span>
            <span className="text-foreground">{formatTokens(response.tokenCount)}</span>
          </div>
        )}
      </div>

      <div className="mt-4 min-h-[220px] rounded-xl border border-white/10 bg-black/20 p-4">
        {response ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
            {response.text || "No response returned."}
          </p>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Awaiting comparison run
          </div>
        )}
      </div>
    </div>
  );
}

export function TestLab({ agentId, currentConfig, onApplyVersion }: Props) {
  const { toast } = useToast();
  const [testPrompt, setTestPrompt] = useState(currentConfig.systemPrompt);
  const [testModel, setTestModel] = useState(currentConfig.llmModel);
  const [testTemperature, setTestTemperature] = useState(currentConfig.temperature || 0.7);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [rating, setRating] = useState<Winner>(null);
  const [submittingWinner, setSubmittingWinner] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [history, setHistory] = useState<ComparisonRecord[]>([]);
  const [activeComparison, setActiveComparison] = useState<ComparisonRecord | null>(null);

  const testConfig = useMemo<CompareConfig>(() => ({
    systemPrompt: testPrompt,
    llmModel: testModel,
    modelProvider: MODEL_PROVIDER_MAP[testModel] || "ANTHROPIC",
    temperature: testTemperature,
  }), [testModel, testPrompt, testTemperature]);

  useEffect(() => {
    setTestPrompt(currentConfig.systemPrompt);
    setTestModel(currentConfig.llmModel);
    setTestTemperature(currentConfig.temperature || 0.7);
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadHistory();
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/test-compare`);
      if (!res.ok) return;
      const data = await res.json();
      const normalized = Array.isArray(data.history)
        ? data.history.map((item: HistoryRecord) => normalizeHistoryRecord(item))
        : [];
      setSummary(data.summary || emptySummary);
      setHistory(normalized);
      setActiveComparison((prev) => prev || normalized[0] || null);
      setRating((prev) => prev ?? normalized[0]?.winner ?? null);
    } catch {
      // silent
    } finally {
      setLoadingHistory(false);
    }
  }

  async function runComparison() {
    if (!message.trim()) {
      toast("Enter a message to compare both versions.", "error");
      return;
    }

    setRunning(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/test-compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          configA: currentConfig,
          configB: testConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Comparison failed", "error");
        return;
      }

      const fresh: ComparisonRecord = {
        id: data.id,
        message: data.message,
        createdAt: data.createdAt,
        winner: data.winner,
        configA: data.configA,
        configB: data.configB,
        responseA: data.responseA,
        responseB: data.responseB,
      };

      setActiveComparison(fresh);
      setRating(fresh.winner);
      setHistory((prev) => [fresh, ...prev.filter((item) => item.id !== fresh.id)].slice(0, 20));
      setSummary((prev) => ({ ...prev, total: prev.total + 1, unrated: prev.unrated + 1 }));
      toast("Comparison ready");
    } catch {
      toast("Comparison failed", "error");
    } finally {
      setRunning(false);
    }
  }

  async function saveWinner(nextWinner: Exclude<Winner, null>) {
    if (!activeComparison) return;
    setSubmittingWinner(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/test-compare`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comparisonId: activeComparison.id,
          winner: nextWinner,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to log preference", "error");
        return;
      }

      setRating(nextWinner);
      setSummary(data.summary || emptySummary);
      setHistory((prev) =>
        prev.map((item) =>
          item.id === activeComparison.id ? { ...item, winner: nextWinner } : item
        )
      );
      setActiveComparison((prev) => (prev ? { ...prev, winner: nextWinner } : prev));
      toast("Preference saved", "success");
    } catch {
      toast("Failed to log preference", "error");
    } finally {
      setSubmittingWinner(false);
    }
  }

  async function handleApplyVersion() {
    setApplying(true);
    try {
      await onApplyVersion(testConfig);
    } finally {
      setApplying(false);
    }
  }

  const versionBLead = summary.winnerB > summary.winnerA;
  const currentModel = getModelDef(currentConfig.llmModel);
  const testModelDef = getModelDef(testModel);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Comparisons Run" value={summary.total} accent="text-foreground" />
        <SummaryCard label="Version A Wins" value={summary.winnerA} accent="text-blue-400" />
        <SummaryCard label="Version B Wins" value={summary.winnerB} accent="text-kiln-orange" />
        <SummaryCard label="Same Result" value={summary.winnerSame} accent="text-emerald-400" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-blue-300">Current Version</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  {currentModel?.label || currentConfig.llmModel}
                </h3>
              </div>
              <div className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
                Temp {currentConfig.temperature.toFixed(2)}
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="line-clamp-[10] whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                {currentConfig.systemPrompt}
              </p>
            </div>
          </div>

          <ResponseCard title="Response A" response={activeComparison?.responseA || null} tone="blue" />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-kiln-orange/20 bg-kiln-orange/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-kiln-orange">Test Version</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  {testModelDef?.label || testModel}
                </h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTestPrompt(currentConfig.systemPrompt);
                  setTestModel(currentConfig.llmModel);
                  setTestTemperature(currentConfig.temperature || 0.7);
                }}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  System Prompt
                </label>
                <textarea
                  value={testPrompt}
                  onChange={(event) => setTestPrompt(event.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-kiln-orange/50"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr,180px]">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Model
                  </label>
                  <select
                    value={testModel}
                    onChange={(event) => setTestModel(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-kiln-orange/50"
                  >
                    {ALL_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label} ({model.provider})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Temperature
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={testTemperature}
                    onChange={(event) => setTestTemperature(Math.min(1, Math.max(0, Number(event.target.value) || 0)))}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-kiln-orange/50"
                  />
                </div>
              </div>
            </div>
          </div>

          <ResponseCard title="Response B" response={activeComparison?.responseB || null} tone="orange" />
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-card/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Shared Test Message
            </label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              placeholder="Ask both versions the exact same question..."
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-kiln-orange/50"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMessage("")}>
              Clear
            </Button>
            <Button onClick={runComparison} disabled={running}>
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="mr-2 h-4 w-4" />
              )}
              Compare Both
            </Button>
          </div>
        </div>
      </div>

      {activeComparison && (
        <div className="rounded-2xl border border-white/[0.08] bg-card/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Which is better?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You ran {summary.total} comparisons. Version B was preferred {summary.winnerB} times.
                {versionBLead ? " This variant is leading." : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={rating === "A" ? "default" : "outline"}
                size="sm"
                disabled={submittingWinner}
                onClick={() => saveWinner("A")}
              >
                <Trophy className="mr-1.5 h-3.5 w-3.5" />
                A
              </Button>
              <Button
                variant={rating === "SAME" ? "default" : "outline"}
                size="sm"
                disabled={submittingWinner}
                onClick={() => saveWinner("SAME")}
              >
                <Equal className="mr-1.5 h-3.5 w-3.5" />
                Same
              </Button>
              <Button
                variant={rating === "B" ? "default" : "outline"}
                size="sm"
                disabled={submittingWinner}
                onClick={() => saveWinner("B")}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                B
              </Button>
              <Button
                onClick={handleApplyVersion}
                disabled={applying}
                className="bg-kiln-orange text-white hover:bg-kiln-orange/90"
              >
                {applying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CopyCheck className="mr-2 h-4 w-4" />
                )}
                Apply Version B
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.08] bg-card/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Comparison History</h3>
            <p className="text-sm text-muted-foreground">
              Review previous prompts, outcomes, and which variant won.
            </p>
          </div>
          {loadingHistory && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {history.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
            <Zap className="mx-auto h-7 w-7 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium text-foreground">No comparisons yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run your first side-by-side prompt to start building optimization data.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {history.map((item) => {
              const selected = activeComparison?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveComparison(item);
                    setRating(item.winner);
                  }}
                  className={cn(
                    "w-full rounded-xl border px-4 py-4 text-left transition",
                    selected
                      ? "border-kiln-orange/30 bg-kiln-orange/5"
                      : "border-white/10 bg-black/10 hover:border-white/20"
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1">
                          <Clock3 className="h-3 w-3" />
                          {formatRelativeTime(item.createdAt)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1">
                          <Check className="h-3 w-3" />
                          Winner {item.winner || "Unrated"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-medium text-foreground">{item.message}</p>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        A: {item.responseA.text}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        B: {item.responseB.text}
                      </p>
                    </div>

                    <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>A time</span>
                      <span className="text-right text-foreground">{formatResponseTime(item.responseA.responseTimeMs)}</span>
                      <span>B time</span>
                      <span className="text-right text-foreground">{formatResponseTime(item.responseB.responseTimeMs)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
