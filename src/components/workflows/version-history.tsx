"use client";

import { useState, useEffect, useCallback } from "react";
import {
  History,
  RotateCcw,
  GitCompare,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  X,
  MessageSquare,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WorkflowDiffView } from "./workflow-diff";
import type { WorkflowDiff } from "@/lib/workflow-versioning";
import type { WorkflowNode, WorkflowEdge, WorkflowVariable } from "@/lib/workflow-node-types";

/* ── Types ── */

interface VersionEntry {
  id: string;
  version: number;
  changelog: string;
  note: string | null;
  createdAt: string;
  createdBy: string;
}

interface VersionConfig {
  name: string;
  nodes: Array<{ id: string; type: string; label: string; position: { x: number; y: number }; config: Record<string, unknown> }>;
  edges: Array<{ sourceId: string; targetId: string; condition?: string; sourceHandle?: string }>;
  variables: Array<{ id: string; name: string; defaultValue: string; type: string; description: string; isSecret: boolean }>;
}

/* ── Helpers ── */

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

/* ── Version Row ── */

function VersionRow({
  entry,
  isCurrent,
  isSelected,
  onSelect,
  onRollback,
  onCompare,
  rolling,
}: {
  entry: VersionEntry;
  isCurrent: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onRollback: () => void;
  onCompare: () => void;
  rolling: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "group rounded-lg border transition-colors",
        isSelected
          ? "border-orange-500/40 bg-orange-500/5"
          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
      )}
    >
      <button
        onClick={() => {
          setExpanded(!expanded);
          onSelect();
        }}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <div className="mt-0.5">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-medium text-zinc-300">
              v{entry.version}
            </span>
            {isCurrent && (
              <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[9px] font-medium text-green-400">
                current
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-400">{entry.changelog}</p>
          {entry.note && (
            <div className="mt-1 flex items-start gap-1">
              <MessageSquare className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 text-zinc-600" />
              <p className="text-[10px] text-zinc-500 italic">{entry.note}</p>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="text-[10px] text-zinc-600">{relativeTime(entry.createdAt)}</p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/60 px-4 py-2.5 flex items-center gap-2">
          {!isCurrent && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRollback}
              disabled={rolling}
              className="text-xs h-7"
            >
              {rolling ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-3 w-3" />
              )}
              Rollback
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onCompare}
            className="text-xs h-7"
          >
            <GitCompare className="mr-1.5 h-3 w-3" />
            Compare
          </Button>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-zinc-600">
            <Clock className="h-2.5 w-2.5" />
            {new Date(entry.createdAt).toLocaleString("de-DE")}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Compare Modal ── */

function CompareModal({
  open,
  onClose,
  teamId,
  versionA,
  versionB,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  versionA: VersionEntry | null;
  versionB: VersionEntry | null;
}) {
  const [loading, setLoading] = useState(false);
  const [configA, setConfigA] = useState<VersionConfig | null>(null);
  const [configB, setConfigB] = useState<VersionConfig | null>(null);
  const [diff, setDiff] = useState<WorkflowDiff | null>(null);

  useEffect(() => {
    if (!open || !versionA || !versionB) return;

    setLoading(true);

    fetch(`/api/teams/${teamId}/versions/compare?a=${versionA.id}&b=${versionB.id}`)
      .then((r) => r.json())
      .then((data) => {
        setConfigA(data.configA);
        setConfigB(data.configB);
        setDiff(data.diff);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, teamId, versionA, versionB]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <GitCompare className="h-5 w-5 text-orange-500" />
            <h2 className="font-serif text-lg text-zinc-100">
              Compare v{versionA?.version} → v{versionB?.version}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        ) : configA && configB && diff ? (
          <WorkflowDiffView
            versionA={{ name: configA.name, nodes: configA.nodes as unknown as WorkflowNode[], edges: configA.edges as unknown as WorkflowEdge[], variables: configA.variables as unknown as WorkflowVariable[] }}
            versionB={{ name: configB.name, nodes: configB.nodes as unknown as WorkflowNode[], edges: configB.edges as unknown as WorkflowEdge[], variables: configB.variables as unknown as WorkflowVariable[] }}
            diff={diff}
            labelA={`v${versionA?.version}`}
            labelB={`v${versionB?.version}`}
          />
        ) : (
          <p className="text-center text-sm text-zinc-500">Could not load version data</p>
        )}
      </div>
    </div>
  );
}

/* ── Main Panel ── */

export function VersionHistoryPanel({
  teamId,
  currentVersion,
  onRollback,
}: {
  teamId: string;
  currentVersion?: number;
  onRollback?: () => void;
}) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);

  // Compare state
  const [compareA, setCompareA] = useState<VersionEntry | null>(null);
  const [compareB, setCompareB] = useState<VersionEntry | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleRollback = async (versionId: string) => {
    setRolling(versionId);
    try {
      const res = await fetch(`/api/teams/${teamId}/versions/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (res.ok) {
        await fetchVersions();
        onRollback?.();
      }
    } catch {
      // Silent
    } finally {
      setRolling(null);
    }
  };

  const handleCompare = (entry: VersionEntry) => {
    if (!compareA) {
      setCompareA(entry);
    } else if (compareA.id === entry.id) {
      setCompareA(null);
    } else {
      setCompareB(entry);
      setShowCompare(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-medium text-zinc-100">Version History</h3>
          {currentVersion && (
            <span className="text-xs text-zinc-600">Current: v{currentVersion}</span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={fetchVersions} className="text-xs h-7">
          Refresh
        </Button>
      </div>

      {/* Compare hint */}
      {compareA && !showCompare && (
        <div className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2">
          <GitCompare className="h-3.5 w-3.5 text-violet-400" />
          <p className="text-xs text-violet-300">
            Comparing v{compareA.version} — click Compare on another version
          </p>
          <button
            onClick={() => setCompareA(null)}
            className="ml-auto text-xs text-violet-400 hover:text-violet-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-800/60" />
          ))}
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 py-12 text-center">
          <History className="mb-3 h-8 w-8 text-zinc-700" />
          <p className="text-sm text-zinc-400">No versions yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            Save your workflow to create the first version
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((entry) => (
            <VersionRow
              key={entry.id}
              entry={entry}
              isCurrent={entry.version === currentVersion}
              isSelected={selected === entry.id}
              onSelect={() => setSelected(entry.id)}
              onRollback={() => handleRollback(entry.id)}
              onCompare={() => handleCompare(entry)}
              rolling={rolling === entry.id}
            />
          ))}
        </div>
      )}

      {/* Compare Modal */}
      <CompareModal
        open={showCompare}
        onClose={() => {
          setShowCompare(false);
          setCompareA(null);
          setCompareB(null);
        }}
        teamId={teamId}
        versionA={compareA}
        versionB={compareB}
      />
    </div>
  );
}

/* ── Save Note Input ── */

export function SaveNoteInput({
  onSave,
  saving,
}: {
  onSave: (note: string) => void;
  saving: boolean;
}) {
  const [note, setNote] = useState("");
  const [showInput, setShowInput] = useState(false);

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        + Add save note
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What changed? (optional)"
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-100 px-2.5 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-zinc-600"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(note);
          if (e.key === "Escape") setShowInput(false);
        }}
      />
      <Button
        size="sm"
        onClick={() => onSave(note)}
        disabled={saving}
        className="text-xs h-7"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
      </Button>
    </div>
  );
}
