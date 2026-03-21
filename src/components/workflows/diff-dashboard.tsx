"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Eye,
  Loader2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface DiffChangeEntry {
  id: string;
  url: string;
  changes: Array<{
    changeType: string;
    description: string;
    importance: string;
    details: { before?: string; after?: string };
  }>;
  summary: string;
  importance: string;
  detectedAt: string;
  snapshotBeforeUrl?: string | null;
  snapshotAfterUrl?: string | null;
}

interface DiffTrackerEntry {
  id: string;
  url: string;
  schedule: string;
  sensitivity: string;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastChangeDetectedAt: string | null;
  changeCount: number;
}

interface DiffDashboardProps {
  agentId?: string;
  className?: string;
}

const CHANGE_TYPE_COLORS: Record<string, string> = {
  price_change: "bg-red-500/10 text-red-400 border-red-500/20",
  new_product: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  content_update: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  removed_item: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  layout_change: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  new_promotion: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  other: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const IMPORTANCE_COLORS: Record<string, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-zinc-500",
};

export function DiffDashboard({ agentId, className }: DiffDashboardProps) {
  const [trackers, setTrackers] = useState<DiffTrackerEntry[]>([]);
  const [changes, setChanges] = useState<DiffChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [expandedChange, setExpandedChange] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = agentId ? `?agentId=${agentId}` : "";
      const [trackersRes, changesRes] = await Promise.all([
        fetch(`/api/diff/trackers${params}`),
        fetch(`/api/diff/changes${params}`),
      ]);

      if (trackersRes.ok) setTrackers(await trackersRes.json());
      if (changesRes.ok) setChanges(await changesRes.json());
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const filteredChanges = filter === "all"
    ? changes
    : changes.filter((c) => c.importance === filter || c.changes.some((ch) => ch.changeType === filter));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-medium text-foreground">Change Detection</h3>
          <span className="text-[10px] text-muted-foreground">
            {trackers.length} URL{trackers.length !== 1 ? "s" : ""} monitored
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={load} className="h-7">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Tracked URLs */}
      {trackers.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-foreground mb-3">Monitored URLs</p>
          <div className="space-y-2">
            {trackers.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn("h-2 w-2 rounded-full shrink-0", t.isActive ? "bg-emerald-400" : "bg-zinc-600")} />
                  <span className="text-xs text-foreground truncate max-w-[200px]">{t.url}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
                  <span>{t.sensitivity.replace("_", " ")}</span>
                  <span>{t.changeCount} changes</span>
                  {t.lastCheckedAt && (
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(t.lastCheckedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-1.5">
        <Filter className="h-3 w-3 text-zinc-500" />
        {["all", "high", "medium", "low", "price_change", "new_product"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-all",
              filter === f
                ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                : "border-zinc-800 text-zinc-500 hover:border-zinc-700",
            )}
          >
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Changes Timeline */}
      {filteredChanges.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Eye className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No changes detected yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredChanges.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              {/* Change Header */}
              <button
                onClick={() => setExpandedChange(expandedChange === entry.id ? null : entry.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-zinc-900/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", IMPORTANCE_COLORS[entry.importance])} />
                  <span className="text-xs text-foreground truncate">{entry.url}</span>
                  <div className="flex gap-1">
                    {entry.changes.slice(0, 3).map((c, i) => (
                      <span
                        key={i}
                        className={cn(
                          "rounded-full border px-1.5 py-0 text-[9px]",
                          CHANGE_TYPE_COLORS[c.changeType] || CHANGE_TYPE_COLORS.other,
                        )}
                      >
                        {c.changeType.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(entry.detectedAt).toLocaleString()}
                </span>
              </button>

              {/* Expanded Detail */}
              {expandedChange === entry.id && (
                <div className="border-t border-border p-3 space-y-3">
                  <p className="text-xs text-muted-foreground">{entry.summary}</p>

                  {entry.changes.map((change, i) => (
                    <div key={i} className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("rounded-full border px-1.5 py-0 text-[9px]", CHANGE_TYPE_COLORS[change.changeType] || CHANGE_TYPE_COLORS.other)}>
                          {change.changeType.replace("_", " ")}
                        </span>
                        <span className={cn("text-[10px]", IMPORTANCE_COLORS[change.importance])}>
                          {change.importance}
                        </span>
                      </div>
                      <p className="text-xs text-foreground">{change.description}</p>
                      {change.details.before && (
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <ArrowDownRight className="h-3 w-3 text-red-400" />
                          <span className="text-red-400 line-through">{change.details.before}</span>
                          <ArrowUpRight className="h-3 w-3 text-emerald-400 ml-1" />
                          <span className="text-emerald-400">{change.details.after}</span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Screenshots */}
                  {(entry.snapshotBeforeUrl || entry.snapshotAfterUrl) && (
                    <div className="grid grid-cols-2 gap-2">
                      {entry.snapshotBeforeUrl && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-zinc-500">Before</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={entry.snapshotBeforeUrl} alt="Before" className="rounded-lg border border-zinc-800 w-full" />
                        </div>
                      )}
                      {entry.snapshotAfterUrl && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-zinc-500">After</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={entry.snapshotAfterUrl} alt="After" className="rounded-lg border border-zinc-800 w-full" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
