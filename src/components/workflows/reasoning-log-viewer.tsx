"use client";

import { useState, useMemo } from "react";
import {
  Brain, ChevronDown, ChevronRight, AlertTriangle,
  CheckCircle2, XCircle, Filter, Clock, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReasoningEntry, ReasoningSummary } from "@/lib/sandbox/reasoning-logger";

type FilterMode = "all" | "decisions" | "errors" | "low_confidence";

interface ReasoningLogViewerProps {
  entries: ReasoningEntry[];
  summary?: ReasoningSummary;
}

export function ReasoningLogViewer({ entries, summary }: ReasoningLogViewerProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

  const filteredEntries = useMemo(() => {
    switch (filter) {
      case "decisions":
        return entries.filter((e) =>
          e.action !== "scroll" && e.action !== "analyze"
        );
      case "errors":
        return entries.filter(
          (e) => e.verificationResult && !e.verificationResult.success
        );
      case "low_confidence":
        return entries.filter((e) => e.confidence < 0.7);
      default:
        return entries;
    }
  }, [entries, filter]);

  const filters: { id: FilterMode; label: string; count: number }[] = [
    { id: "all", label: "Alle", count: entries.length },
    { id: "decisions", label: "Entscheidungen", count: entries.filter((e) => e.action !== "scroll" && e.action !== "analyze").length },
    { id: "errors", label: "Fehler", count: entries.filter((e) => e.verificationResult && !e.verificationResult.success).length },
    { id: "low_confidence", label: "Unsicher", count: entries.filter((e) => e.confidence < 0.7).length },
  ];

  if (entries.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Agent Reasoning</p>
        <div className="rounded-lg border border-[#332f2b] bg-[#1a1918] p-4 text-center">
          <Brain className="h-5 w-5 text-zinc-600 mx-auto mb-2" />
          <p className="text-[11px] text-zinc-600">Noch keine Reasoning-Einträge...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Bar */}
      {summary && (
        <div className="flex items-center gap-4 text-[10px] text-zinc-500 bg-[#1a1918] rounded-lg px-3 py-2 border border-[#332f2b]">
          <span>{summary.totalSteps} Schritte</span>
          <span>Ø Confidence: {Math.round(summary.averageConfidence * 100)}%</span>
          {summary.lowConfidenceSteps > 0 && (
            <span className="text-yellow-500">
              {summary.lowConfidenceSteps} unsicher
            </span>
          )}
          {summary.failedVerifications > 0 && (
            <span className="text-red-400">
              {summary.failedVerifications} fehlgeschlagen
            </span>
          )}
          <span className="ml-auto">
            <Clock className="inline h-2.5 w-2.5 mr-0.5" />
            {Math.round(summary.totalThinkingTimeMs / 1000)}s Denkzeit
          </span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex gap-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "px-2 py-1 rounded text-[10px] font-medium transition-colors",
              filter === f.id
                ? "bg-orange-500/20 text-orange-400"
                : "text-zinc-600 hover:text-zinc-400 hover:bg-[#1e1d1b]"
            )}
          >
            {f.label}
            {f.count > 0 && (
              <span className="ml-1 text-[9px] opacity-60">({f.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {filteredEntries.map((entry) => (
          <ReasoningEntryRow
            key={entry.step}
            entry={entry}
            expanded={expandedEntry === entry.step}
            onToggle={() =>
              setExpandedEntry(expandedEntry === entry.step ? null : entry.step)
            }
          />
        ))}
      </div>
    </div>
  );
}

function ReasoningEntryRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: ReasoningEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const confidenceColor =
    entry.confidence >= 0.8
      ? "bg-green-500"
      : entry.confidence >= 0.6
        ? "bg-yellow-500"
        : "bg-red-500";

  const verificationIcon = entry.verificationResult ? (
    entry.verificationResult.success ? (
      <CheckCircle2 className="h-3 w-3 text-green-500" />
    ) : (
      <XCircle className="h-3 w-3 text-red-400" />
    )
  ) : null;

  return (
    <div className="rounded-lg border border-[#332f2b] bg-[#1a1918] overflow-hidden">
      {/* Header — immer sichtbar */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1e1d1b] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-zinc-600 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-zinc-600 shrink-0" />
        )}

        {/* Step Number */}
        <span className="text-[10px] font-mono text-zinc-600 w-5 shrink-0">
          #{entry.step + 1}
        </span>

        {/* Confidence Bar */}
        <div className="w-12 h-1.5 rounded-full bg-[#332f2b] shrink-0">
          <div
            className={cn("h-full rounded-full", confidenceColor)}
            style={{ width: `${entry.confidence * 100}%` }}
          />
        </div>

        {/* Action Badge */}
        <span className="text-[10px] font-mono font-medium text-zinc-400 uppercase shrink-0">
          {entry.action}
        </span>

        {/* Reasoning Preview */}
        <span className="text-[11px] text-zinc-500 truncate flex-1 min-w-0">
          {entry.observation || entry.reasoning.slice(0, 80)}
        </span>

        {/* Verification Icon */}
        {verificationIcon}

        {/* Low Confidence Warning */}
        {entry.confidence < 0.6 && (
          <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
        )}
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[#332f2b]">
          {/* Observation */}
          <div className="pt-2">
            <div className="flex items-center gap-1 text-[10px] text-zinc-600 mb-1">
              <Eye className="h-2.5 w-2.5" />
              Beobachtung
            </div>
            <p className="text-[11px] text-zinc-400">{entry.observation}</p>
          </div>

          {/* Reasoning */}
          <div>
            <div className="flex items-center gap-1 text-[10px] text-zinc-600 mb-1">
              <Brain className="h-2.5 w-2.5" />
              Überlegung
            </div>
            <p className="text-[11px] text-zinc-300">{entry.reasoning}</p>
          </div>

          {/* Target */}
          {entry.target && (
            <div className="text-[10px]">
              <span className="text-zinc-600">Ziel: </span>
              <span className="text-zinc-400 font-mono">{entry.target}</span>
            </div>
          )}

          {/* Alternatives */}
          {entry.alternativesConsidered.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-[10px] text-zinc-600 mb-1">
                <Filter className="h-2.5 w-2.5" />
                Alternativen erwogen
              </div>
              <ul className="space-y-0.5">
                {entry.alternativesConsidered.map((alt, i) => (
                  <li key={i} className="text-[10px] text-zinc-500 pl-3 relative">
                    <span className="absolute left-0 text-zinc-700">•</span>
                    {alt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Verification Result */}
          {entry.verificationResult && (
            <div className={cn(
              "rounded px-2.5 py-1.5 text-[10px]",
              entry.verificationResult.success
                ? "bg-green-500/10 border border-green-500/20"
                : "bg-red-500/10 border border-red-500/20"
            )}>
              <div className="flex items-center gap-1.5">
                {entry.verificationResult.success ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-400" />
                )}
                <span className={entry.verificationResult.success ? "text-green-400" : "text-red-400"}>
                  Verifikation: {entry.verificationResult.success ? "Erfolgreich" : "Fehlgeschlagen"}
                  {" "}({Math.round(entry.verificationResult.confidence * 100)}%)
                </span>
              </div>
              {entry.verificationResult.issue && (
                <p className="text-red-400 mt-1">{entry.verificationResult.issue}</p>
              )}
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-4 text-[9px] text-zinc-700 pt-1 border-t border-[#1e1d1b]">
            <span>Confidence: {Math.round(entry.confidence * 100)}%</span>
            <span>Denkzeit: {entry.thinkingDurationMs}ms</span>
            <span>{new Date(entry.timestamp).toLocaleTimeString("de-DE")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
