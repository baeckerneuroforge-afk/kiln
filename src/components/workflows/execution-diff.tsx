"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  ArrowRightLeft,
  Clock,
  GitBranch,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExecutionListItem {
  id: string;
  status: string;
  goal: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface StepMetrics {
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
  responseTimeMs: number;
}

interface ExecutionStep {
  nodeId: string;
  nodeType: string;
  status: string;
  output: string | null;
  error: string | null;
  metrics: StepMetrics | null;
  sharedContextAfter: Record<string, unknown> | null;
}

interface ReplayResponse {
  execution: ExecutionListItem;
  steps: ExecutionStep[];
  team: unknown;
}

export interface ExecutionDiffProps {
  teamId: string;
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function pctChange(a: number, b: number): string {
  if (a === 0 && b === 0) return "0%";
  if (a === 0) return "+∞";
  const pct = ((b - a) / a) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

/** Gather all unique node IDs across two step arrays, preserving order. */
function allNodeIds(stepsA: ExecutionStep[], stepsB: ExecutionStep[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of stepsA) {
    if (!seen.has(s.nodeId)) {
      seen.add(s.nodeId);
      result.push(s.nodeId);
    }
  }
  for (const s of stepsB) {
    if (!seen.has(s.nodeId)) {
      seen.add(s.nodeId);
      result.push(s.nodeId);
    }
  }
  return result;
}

function stepsByNodeId(steps: ExecutionStep[]): Map<string, ExecutionStep> {
  const map = new Map<string, ExecutionStep>();
  for (const s of steps) {
    map.set(s.nodeId, s);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ExecutionSelector({
  label,
  executions,
  value,
  onChange,
}: {
  label: string;
  executions: ExecutionListItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100",
          "font-mono focus:outline-none focus:ring-1 focus:ring-orange-500/50",
          "appearance-none cursor-pointer"
        )}
      >
        <option value="">— Ausführung wählen —</option>
        {executions.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {formatDate(ex.startedAt)} · {ex.status}
            {ex.goal ? ` · ${ex.goal.slice(0, 40)}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function RoutingDiff({
  nodeIds,
  mapA,
  mapB,
}: {
  nodeIds: string[];
  mapA: Map<string, ExecutionStep>;
  mapB: Map<string, ExecutionStep>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
        <GitBranch className="h-4 w-4 text-orange-500" />
        Routing-Vergleich
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Column headers */}
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider px-2">
          Ausführung A
        </div>
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider px-2">
          Ausführung B
        </div>

        {nodeIds.map((nodeId) => {
          const inA = mapA.has(nodeId);
          const inB = mapB.has(nodeId);
          const onlyA = inA && !inB;
          const onlyB = !inA && inB;

          return (
            <div key={nodeId} className="contents">
              {/* A side */}
              <div
                className={cn(
                  "rounded-md border px-3 py-2 text-xs font-mono",
                  inA
                    ? onlyA
                      ? "border-red-500/40 bg-red-500/10 text-red-400"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300"
                    : "border-zinc-800/50 bg-zinc-900/30 text-zinc-600"
                )}
              >
                {inA ? (
                  <span className="flex items-center gap-1.5">
                    {mapA.get(nodeId)!.status === "completed" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-red-400" />
                    )}
                    {nodeId}
                    <span className="text-zinc-500 ml-auto">
                      {mapA.get(nodeId)!.nodeType}
                    </span>
                  </span>
                ) : (
                  <span className="text-zinc-600 italic">—</span>
                )}
              </div>

              {/* B side */}
              <div
                className={cn(
                  "rounded-md border px-3 py-2 text-xs font-mono",
                  inB
                    ? onlyB
                      ? "border-green-500/40 bg-green-500/10 text-green-400"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300"
                    : "border-zinc-800/50 bg-zinc-900/30 text-zinc-600"
                )}
              >
                {inB ? (
                  <span className="flex items-center gap-1.5">
                    {mapB.get(nodeId)!.status === "completed" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-red-400" />
                    )}
                    {nodeId}
                    <span className="text-zinc-500 ml-auto">
                      {mapB.get(nodeId)!.nodeType}
                    </span>
                  </span>
                ) : (
                  <span className="text-zinc-600 italic">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OutputDiff({
  nodeIds,
  mapA,
  mapB,
}: {
  nodeIds: string[];
  mapA: Map<string, ExecutionStep>;
  mapB: Map<string, ExecutionStep>;
}) {
  const sharedNodes = nodeIds.filter(
    (id) => mapA.has(id) && mapB.has(id)
  );

  if (sharedNodes.length === 0) {
    return (
      <div className="text-xs text-zinc-500 italic">
        Keine gemeinsamen Knoten für Output-Vergleich.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
        <ArrowRightLeft className="h-4 w-4 text-orange-500" />
        Output-Vergleich
      </div>
      <div className="space-y-3">
        {sharedNodes.map((nodeId) => {
          const outA = mapA.get(nodeId)!.output ?? "";
          const outB = mapB.get(nodeId)!.output ?? "";
          const same = outA === outB;

          return (
            <div key={nodeId} className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                <span>{nodeId}</span>
                {same ? (
                  <span className="text-zinc-600 ml-auto">identisch</span>
                ) : (
                  <span className="text-orange-500 ml-auto">unterschiedlich</span>
                )}
              </div>
              {!same && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                    <pre className="text-xs font-mono text-red-400/80 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {outA || <span className="text-zinc-600 italic">leer</span>}
                    </pre>
                  </div>
                  <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                    <pre className="text-xs font-mono text-green-400/80 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {outB || <span className="text-zinc-600 italic">leer</span>}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimingDiff({
  nodeIds,
  mapA,
  mapB,
}: {
  nodeIds: string[];
  mapA: Map<string, ExecutionStep>;
  mapB: Map<string, ExecutionStep>;
}) {
  const timingNodes = nodeIds.filter((id) => {
    const a = mapA.get(id)?.metrics?.responseTimeMs;
    const b = mapB.get(id)?.metrics?.responseTimeMs;
    return a != null || b != null;
  });

  if (timingNodes.length === 0) {
    return (
      <div className="text-xs text-zinc-500 italic">
        Keine Timing-Daten verfügbar.
      </div>
    );
  }

  // Finde Maximum für Skalierung
  let maxTime = 0;
  for (const id of timingNodes) {
    const a = mapA.get(id)?.metrics?.responseTimeMs ?? 0;
    const b = mapB.get(id)?.metrics?.responseTimeMs ?? 0;
    maxTime = Math.max(maxTime, a, b);
  }
  if (maxTime === 0) maxTime = 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
        <Clock className="h-4 w-4 text-orange-500" />
        Timing-Vergleich
      </div>
      <div className="space-y-3">
        {timingNodes.map((nodeId) => {
          const timeA = mapA.get(nodeId)?.metrics?.responseTimeMs ?? 0;
          const timeB = mapB.get(nodeId)?.metrics?.responseTimeMs ?? 0;
          const widthA = (timeA / maxTime) * 100;
          const widthB = (timeB / maxTime) * 100;

          return (
            <div key={nodeId} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>{nodeId}</span>
                <span className="text-zinc-500">{pctChange(timeA, timeB)}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500 w-6 shrink-0">A</span>
                  <div className="flex-1 h-5 bg-zinc-900 rounded-sm overflow-hidden border border-zinc-800">
                    <div
                      className="h-full bg-orange-500/60 rounded-sm transition-all"
                      style={{ width: `${widthA}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 w-14 text-right shrink-0">
                    {formatMs(timeA)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500 w-6 shrink-0">B</span>
                  <div className="flex-1 h-5 bg-zinc-900 rounded-sm overflow-hidden border border-zinc-800">
                    <div
                      className="h-full bg-blue-500/60 rounded-sm transition-all"
                      style={{ width: `${widthB}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 w-14 text-right shrink-0">
                    {formatMs(timeB)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WhatChangedSummary({
  nodeIds,
  mapA,
  mapB,
  execA,
  execB,
}: {
  nodeIds: string[];
  mapA: Map<string, ExecutionStep>;
  mapB: Map<string, ExecutionStep>;
  execA: ExecutionListItem;
  execB: ExecutionListItem;
}) {
  const insights: string[] = [];

  // Status-Unterschiede auf Ausführungs-Ebene
  if (execA.status !== execB.status) {
    insights.push(
      `Status unterschiedlich: A = "${execA.status}", B = "${execB.status}".`
    );
  }

  // Routing-Unterschiede
  const onlyInA = nodeIds.filter((id) => mapA.has(id) && !mapB.has(id));
  const onlyInB = nodeIds.filter((id) => !mapA.has(id) && mapB.has(id));
  if (onlyInA.length > 0) {
    insights.push(
      `Routing: ${onlyInA.length} Knoten nur in A (${onlyInA.join(", ")}).`
    );
  }
  if (onlyInB.length > 0) {
    insights.push(
      `Routing: ${onlyInB.length} Knoten nur in B (${onlyInB.join(", ")}).`
    );
  }

  // Output-Unterschiede
  const outputDiffs: string[] = [];
  for (const id of nodeIds) {
    const sA = mapA.get(id);
    const sB = mapB.get(id);
    if (sA && sB && sA.output !== sB.output) {
      outputDiffs.push(id);
    }
  }
  if (outputDiffs.length > 0) {
    insights.push(
      `Output-Unterschiede bei ${outputDiffs.length} Knoten: ${outputDiffs.join(", ")}.`
    );
  }

  // Timing-Unterschiede (> 20% Abweichung)
  const timingDiffs: string[] = [];
  for (const id of nodeIds) {
    const tA = mapA.get(id)?.metrics?.responseTimeMs;
    const tB = mapB.get(id)?.metrics?.responseTimeMs;
    if (tA != null && tB != null && tA > 0) {
      const change = Math.abs((tB - tA) / tA) * 100;
      if (change > 20) {
        timingDiffs.push(`${id} (${pctChange(tA, tB)})`);
      }
    }
  }
  if (timingDiffs.length > 0) {
    insights.push(
      `Signifikante Timing-Abweichungen (>20%): ${timingDiffs.join(", ")}.`
    );
  }

  // Knoten-Status-Unterschiede
  const statusDiffs: string[] = [];
  for (const id of nodeIds) {
    const sA = mapA.get(id);
    const sB = mapB.get(id);
    if (sA && sB && sA.status !== sB.status) {
      statusDiffs.push(`${id}: A="${sA.status}", B="${sB.status}"`);
    }
  }
  if (statusDiffs.length > 0) {
    insights.push(`Knoten-Status-Unterschiede: ${statusDiffs.join("; ")}.`);
  }

  if (insights.length === 0) {
    insights.push("Keine signifikanten Unterschiede erkannt.");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
        <AlertCircle className="h-4 w-4 text-orange-500" />
        Was hat sich geändert?
      </div>
      <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4 space-y-2">
        {insights.map((text, i) => (
          <p key={i} className="text-xs text-zinc-400 leading-relaxed">
            • {text}
          </p>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ExecutionDiff({ teamId, open, onClose }: ExecutionDiffProps) {
  const [executions, setExecutions] = useState<ExecutionListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("");

  const [replayA, setReplayA] = useState<ReplayResponse | null>(null);
  const [replayB, setReplayB] = useState<ReplayResponse | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  // Lade Ausführungs-Liste
  useEffect(() => {
    if (!open || !teamId) return;
    setLoadingList(true);
    fetch(`/api/teams/${teamId}/executions`)
      .then((res) => res.json())
      .then((data: ExecutionListItem[]) => {
        setExecutions(Array.isArray(data) ? data : []);
      })
      .catch(() => setExecutions([]))
      .finally(() => setLoadingList(false));
  }, [open, teamId]);

  // Lade Replay A
  useEffect(() => {
    if (!selectedA || !teamId) {
      setReplayA(null);
      return;
    }
    setLoadingA(true);
    fetch(`/api/teams/${teamId}/executions/${selectedA}/replay`)
      .then((res) => res.json())
      .then((data: ReplayResponse) => setReplayA(data))
      .catch(() => setReplayA(null))
      .finally(() => setLoadingA(false));
  }, [selectedA, teamId]);

  // Lade Replay B
  useEffect(() => {
    if (!selectedB || !teamId) {
      setReplayB(null);
      return;
    }
    setLoadingB(true);
    fetch(`/api/teams/${teamId}/executions/${selectedB}/replay`)
      .then((res) => res.json())
      .then((data: ReplayResponse) => setReplayB(data))
      .catch(() => setReplayB(null))
      .finally(() => setLoadingB(false));
  }, [selectedB, teamId]);

  // Diff-Daten berechnen
  const diffData = useMemo(() => {
    if (!replayA || !replayB) return null;
    const mapA = stepsByNodeId(replayA.steps);
    const mapB = stepsByNodeId(replayB.steps);
    const nodeIds = allNodeIds(replayA.steps, replayB.steps);
    return { mapA, mapB, nodeIds };
  }, [replayA, replayB]);

  const handleClose = useCallback(() => {
    setSelectedA("");
    setSelectedB("");
    setReplayA(null);
    setReplayB(null);
    onClose();
  }, [onClose]);

  if (!open) return null;

  const loading = loadingA || loadingB;
  const ready = diffData !== null && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={cn(
          "relative z-10 w-full max-w-5xl max-h-[90vh] overflow-hidden",
          "rounded-xl border border-zinc-800 bg-[#0C0A09] shadow-2xl",
          "flex flex-col"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
              <ArrowRightLeft className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Ausführungs-Vergleich
              </h2>
              <p className="text-xs text-zinc-500">
                Zwei Ausführungen Seite an Seite vergleichen
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Selectors */}
        <div className="border-b border-zinc-800 px-6 py-4 shrink-0">
          {loadingList ? (
            <div className="text-xs text-zinc-500 font-mono">
              Ausführungen laden...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <ExecutionSelector
                label="Ausführung A"
                executions={executions}
                value={selectedA}
                onChange={setSelectedA}
              />
              <ExecutionSelector
                label="Ausführung B"
                executions={executions}
                value={selectedB}
                onChange={setSelectedB}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-xs text-zinc-500 font-mono animate-pulse">
                Replay-Daten laden...
              </div>
            </div>
          )}

          {!loading && !ready && (selectedA || selectedB) && (
            <div className="flex items-center justify-center py-12">
              <div className="text-xs text-zinc-500">
                Bitte beide Ausführungen auswählen, um den Vergleich zu starten.
              </div>
            </div>
          )}

          {!loading && !selectedA && !selectedB && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <ArrowRightLeft className="h-8 w-8 text-zinc-700" />
              <div className="text-xs text-zinc-500 text-center max-w-xs">
                Wähle zwei Ausführungen aus, um Routing, Outputs und Timing zu
                vergleichen.
              </div>
            </div>
          )}

          {ready && diffData && replayA && replayB && (
            <>
              {/* Was hat sich geändert? (Zusammenfassung oben) */}
              <WhatChangedSummary
                nodeIds={diffData.nodeIds}
                mapA={diffData.mapA}
                mapB={diffData.mapB}
                execA={replayA.execution}
                execB={replayB.execution}
              />

              {/* Routing */}
              <RoutingDiff
                nodeIds={diffData.nodeIds}
                mapA={diffData.mapA}
                mapB={diffData.mapB}
              />

              {/* Outputs */}
              <OutputDiff
                nodeIds={diffData.nodeIds}
                mapA={diffData.mapA}
                mapB={diffData.mapB}
              />

              {/* Timing */}
              <TimingDiff
                nodeIds={diffData.nodeIds}
                mapA={diffData.mapA}
                mapB={diffData.mapB}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
