"use client";

import { useState, useEffect, useMemo } from "react";
import {
  X,
  Flame,
  Timer,
  Zap,
  DollarSign,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepMetrics {
  responseTimeMs: number;
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
  model?: string;
}

interface ExecutionStep {
  nodeId: string;
  nodeType: string;
  taskTitle: string;
  status: string;
  metrics: StepMetrics;
}

interface PerformanceProfilerProps {
  teamId: string;
  executionId: string | null;
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

/** Farbe je Node-Type-Kategorie */
const CATEGORY_COLORS: Record<string, string> = {
  trigger_webhook: "#F59E0B",
  trigger_schedule: "#F59E0B",
  trigger_lead: "#F59E0B",
  trigger_chat: "#F59E0B",
  trigger_manual: "#F59E0B",
  agent: "#F97316",
  if_condition: "#8B5CF6",
  switch: "#8B5CF6",
  filter: "#8B5CF6",
  transform: "#8B5CF6",
  http_request: "#3B82F6",
  send_email: "#3B82F6",
  send_slack: "#3B82F6",
  delay: "#3B82F6",
  set_variable: "#3B82F6",
  approval_gate: "#06B6D4",
  wait_webhook: "#06B6D4",
  wait_form: "#06B6D4",
  sub_workflow: "#06B6D4",
  merge: "#06B6D4",
};

function getCategoryColor(nodeType: string): string {
  if (CATEGORY_COLORS[nodeType]) return CATEGORY_COLORS[nodeType];
  if (nodeType.startsWith("trigger")) return "#F59E0B";
  if (nodeType.startsWith("agent") || nodeType === "agent") return "#F97316";
  if (["if_condition", "switch", "filter", "transform"].includes(nodeType))
    return "#8B5CF6";
  if (
    ["http_request", "send_email", "send_slack", "delay", "set_variable"].includes(
      nodeType
    )
  )
    return "#3B82F6";
  return "#06B6D4";
}

function getCategoryLabel(nodeType: string): string {
  if (nodeType.startsWith("trigger")) return "Trigger";
  if (nodeType.startsWith("agent") || nodeType === "agent") return "Agent";
  if (["if_condition", "switch", "filter", "transform"].includes(nodeType))
    return "Logic";
  if (
    ["http_request", "send_email", "send_slack", "delay", "set_variable"].includes(
      nodeType
    )
  )
    return "Action";
  return "Control";
}

function getBottleneckSuggestion(
  nodeType: string,
  durationMs: number
): string {
  if (nodeType === "agent" || nodeType.startsWith("agent")) {
    return durationMs > 3000
      ? "Schnelleres Modell verwenden oder System Prompt kürzen"
      : "System Prompt optimieren, um Token-Verbrauch zu reduzieren";
  }
  if (nodeType === "http_request") {
    return durationMs > 2000
      ? "Endpoint-Latenz prüfen oder Response cachen"
      : "Response cachen, um wiederholte Anfragen zu vermeiden";
  }
  if (nodeType === "delay") {
    return `Delay ist beabsichtigt — ${(durationMs / 1000).toFixed(1)}s`;
  }
  if (durationMs < 500) {
    return "Dieser Node ist schnell";
  }
  return "Ausführungszeit prüfen und ggf. optimieren";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Komponente
// ---------------------------------------------------------------------------

export function PerformanceProfiler({
  teamId,
  executionId,
  open,
  onClose,
}: PerformanceProfilerProps) {
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [hoveredStep, setHoveredStep] = useState<string | null>(null);

  // Daten laden
  useEffect(() => {
    if (!open || !executionId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedStep(null);

    async function fetchReplay() {
      try {
        const res = await fetch(
          `/api/teams/${teamId}/executions/${executionId}/replay`
        );
        if (!res.ok) throw new Error(`Fehler ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setSteps(data.steps ?? data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Daten konnten nicht geladen werden"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchReplay();
    return () => {
      cancelled = true;
    };
  }, [open, executionId, teamId]);

  // Berechnete Werte
  const stats = useMemo(() => {
    if (steps.length === 0) return null;

    const totalTime = steps.reduce((s, st) => s + st.metrics.responseTimeMs, 0);
    const totalTokensIn = steps.reduce((s, st) => s + st.metrics.tokensIn, 0);
    const totalTokensOut = steps.reduce((s, st) => s + st.metrics.tokensOut, 0);
    const totalCost = steps.reduce((s, st) => s + st.metrics.estimatedCost, 0);
    const avgTime = totalTime / steps.length;

    const sorted = [...steps].sort(
      (a, b) => b.metrics.responseTimeMs - a.metrics.responseTimeMs
    );
    const slowest = sorted[0];
    const fastest = sorted[sorted.length - 1];
    const bottlenecks = sorted.slice(0, 3);

    return {
      totalTime,
      totalTokensIn,
      totalTokensOut,
      totalCost,
      avgTime,
      slowest,
      fastest,
      bottlenecks,
    };
  }, [steps]);

  // Aktuell selektierter Step
  const selectedStepData = steps.find((s) => s.nodeId === selectedStep) ?? null;

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-20 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[600px] z-30 bg-card border-l border-border shadow-2xl transform transition-transform duration-200 flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-orange-500/15">
              <Flame className="w-4 h-4 text-orange-400" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">
              Performance Profiler
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && stats && (
            <>
              {/* --------------------------------------------------------- */}
              {/* Section 1: Flame Chart                                    */}
              {/* --------------------------------------------------------- */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Flame Chart
                  </h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    Gesamt: {formatDuration(stats.totalTime)}
                  </span>
                </div>

                <div className="space-y-1.5 relative">
                  {steps.map((step) => {
                    const pct =
                      stats.totalTime > 0
                        ? (step.metrics.responseTimeMs / stats.totalTime) * 100
                        : 0;
                    const color = getCategoryColor(step.nodeType);
                    const isSelected = selectedStep === step.nodeId;
                    const isHovered = hoveredStep === step.nodeId;

                    return (
                      <div key={step.nodeId} className="relative group">
                        {/* Bar */}
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedStep(
                              isSelected ? null : step.nodeId
                            )
                          }
                          onMouseEnter={() => setHoveredStep(step.nodeId)}
                          onMouseLeave={() => setHoveredStep(null)}
                          className={cn(
                            "relative w-full text-left rounded-md overflow-hidden transition-all",
                            "bg-muted/60 hover:bg-muted",
                            isSelected && "ring-1 ring-orange-500/60"
                          )}
                          style={{ height: 32 }}
                        >
                          {/* Farbiger Balken */}
                          <div
                            className="absolute inset-y-0 left-0 rounded-md transition-all"
                            style={{
                              width: `${Math.max(pct, 2)}%`,
                              backgroundColor: color,
                              opacity: isSelected || isHovered ? 0.35 : 0.2,
                            }}
                          />

                          {/* Label */}
                          <div className="relative z-10 flex items-center justify-between h-full px-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="text-xs text-foreground truncate">
                                {step.taskTitle}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                                {getCategoryLabel(step.nodeType)}
                              </span>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground shrink-0 ml-2">
                              {formatDuration(step.metrics.responseTimeMs)}
                            </span>
                          </div>
                        </button>

                        {/* Tooltip on hover */}
                        {isHovered && (
                          <div className="absolute right-0 top-full mt-1 z-40 bg-background border border-border rounded-lg shadow-xl p-3 min-w-[220px] pointer-events-none">
                            <p className="text-xs font-semibold text-foreground mb-1.5">
                              {step.taskTitle}
                            </p>
                            <div className="space-y-1 text-[11px] font-mono">
                              <div className="flex justify-between text-muted-foreground">
                                <span>Dauer</span>
                                <span className="text-foreground">
                                  {formatDuration(step.metrics.responseTimeMs)}
                                </span>
                              </div>
                              <div className="flex justify-between text-muted-foreground">
                                <span>Tokens In</span>
                                <span className="text-foreground">
                                  {formatTokens(step.metrics.tokensIn)}
                                </span>
                              </div>
                              <div className="flex justify-between text-muted-foreground">
                                <span>Tokens Out</span>
                                <span className="text-foreground">
                                  {formatTokens(step.metrics.tokensOut)}
                                </span>
                              </div>
                              {step.metrics.model && (
                                <div className="flex justify-between text-muted-foreground">
                                  <span>Modell</span>
                                  <span className="text-foreground">
                                    {step.metrics.model}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Legende */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {[
                    { label: "Trigger", color: "#F59E0B" },
                    { label: "Agent", color: "#F97316" },
                    { label: "Logic", color: "#8B5CF6" },
                    { label: "Action", color: "#3B82F6" },
                    { label: "Control", color: "#06B6D4" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Selected Step Detail */}
                {selectedStepData && (
                  <div className="mt-3 p-3 rounded-lg bg-muted/80 border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground">
                        {selectedStepData.taskTitle}
                      </p>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{
                          color: getCategoryColor(selectedStepData.nodeType),
                          backgroundColor: `${getCategoryColor(selectedStepData.nodeType)}20`,
                        }}
                      >
                        {selectedStepData.nodeType}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Status</span>
                        <span
                          className={cn(
                            selectedStepData.status === "completed"
                              ? "text-green-400"
                              : selectedStepData.status === "failed"
                              ? "text-red-400"
                              : "text-foreground"
                          )}
                        >
                          {selectedStepData.status}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Dauer</span>
                        <span className="text-foreground">
                          {formatDuration(selectedStepData.metrics.responseTimeMs)}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Tokens</span>
                        <span className="text-foreground">
                          {formatTokens(selectedStepData.metrics.tokensIn)} /{" "}
                          {formatTokens(selectedStepData.metrics.tokensOut)}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Kosten</span>
                        <span className="text-foreground">
                          ${selectedStepData.metrics.estimatedCost.toFixed(4)}
                        </span>
                      </div>
                      {selectedStepData.metrics.model && (
                        <div className="flex justify-between text-muted-foreground col-span-2">
                          <span>Modell</span>
                          <span className="text-foreground">
                            {selectedStepData.metrics.model}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* --------------------------------------------------------- */}
              {/* Section 2: Bottleneck Analysis                            */}
              {/* --------------------------------------------------------- */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Bottleneck-Analyse
                </h3>

                <div className="space-y-2">
                  {stats.bottlenecks.map((step, idx) => {
                    const pct =
                      stats.totalTime > 0
                        ? (step.metrics.responseTimeMs / stats.totalTime) * 100
                        : 0;
                    const color = getCategoryColor(step.nodeType);
                    const suggestion = getBottleneckSuggestion(
                      step.nodeType,
                      step.metrics.responseTimeMs
                    );

                    return (
                      <div
                        key={step.nodeId}
                        className="p-3 rounded-lg bg-muted/60 border border-border space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">
                              #{idx + 1}
                            </span>
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-xs font-medium text-foreground">
                              {step.taskTitle}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">
                            {formatDuration(step.metrics.responseTimeMs)}
                          </span>
                        </div>

                        {/* Anteil-Balken */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">
                            {pct.toFixed(1)}%
                          </span>
                        </div>

                        {/* Vorschlag */}
                        <div className="flex items-start gap-1.5">
                          <Zap className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                          <span className="text-[11px] text-muted-foreground leading-relaxed">
                            {suggestion}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* --------------------------------------------------------- */}
              {/* Section 3: Summary Stats                                  */}
              {/* --------------------------------------------------------- */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Zusammenfassung
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  {/* Gesamtdauer */}
                  <StatCard
                    icon={<Timer className="w-3.5 h-3.5 text-orange-400" />}
                    label="Gesamtdauer"
                    value={formatDuration(stats.totalTime)}
                  />

                  {/* Tokens */}
                  <StatCard
                    icon={<TrendingUp className="w-3.5 h-3.5 text-violet-400" />}
                    label="Tokens (In / Out)"
                    value={`${formatTokens(stats.totalTokensIn)} / ${formatTokens(stats.totalTokensOut)}`}
                  />

                  {/* Kosten */}
                  <StatCard
                    icon={<DollarSign className="w-3.5 h-3.5 text-green-400" />}
                    label="Geschätzte Kosten"
                    value={`$${stats.totalCost.toFixed(4)}`}
                  />

                  {/* Durchschnitt */}
                  <StatCard
                    icon={<Zap className="w-3.5 h-3.5 text-blue-400" />}
                    label="Durchschnitt / Node"
                    value={formatDuration(Math.round(stats.avgTime))}
                  />

                  {/* Schnellster */}
                  <StatCard
                    icon={<Zap className="w-3.5 h-3.5 text-cyan-400" />}
                    label="Schnellster Node"
                    value={stats.fastest.taskTitle}
                    sub={formatDuration(stats.fastest.metrics.responseTimeMs)}
                  />

                  {/* Langsamster */}
                  <StatCard
                    icon={
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    }
                    label="Langsamster Node"
                    value={stats.slowest.taskTitle}
                    sub={formatDuration(stats.slowest.metrics.responseTimeMs)}
                  />
                </div>
              </section>
            </>
          )}

          {/* Kein Execution gewählt */}
          {!loading && !error && !executionId && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-xs text-center space-y-2">
              <Flame className="w-8 h-8 text-muted-foreground" />
              <p>Keine Ausführung ausgewählt</p>
              <p className="text-muted-foreground">
                Wähle eine Workflow-Ausführung, um das Performance-Profil anzuzeigen.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-Komponente: Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/60 border border-border space-y-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-sm font-mono text-foreground truncate">{value}</p>
      {sub && (
        <p className="text-[10px] font-mono text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}
