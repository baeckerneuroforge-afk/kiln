"use client";

import { useState, useMemo } from "react";
import {
  Globe,
  ArrowUpDown,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface SiteResult {
  url: string;
  status: "completed" | "failed" | "timeout";
  data: Record<string, unknown> | null;
  error?: string;
  screenshotUrl?: string;
  durationMs: number;
}

interface MultiSiteResultsProps {
  results: SiteResult[];
  mergedOutput: Record<string, unknown> | null;
  artifactUrl?: string;
  executionId?: string;
  className?: string;
}

/* ── Helpers ── */

function getValueColumns(results: SiteResult[]): string[] {
  const allKeys = new Set<string>();
  for (const r of results) {
    if (r.data) {
      Object.keys(r.data).forEach((k) => allKeys.add(k));
    }
  }
  return Array.from(allKeys);
}

function isNumeric(val: unknown): boolean {
  if (typeof val === "number") return true;
  if (typeof val === "string") return !isNaN(parseFloat(val.replace(/[^0-9.,]/g, "").replace(",", ".")));
  return false;
}

function extractNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val.replace(/[^0-9.,]/g, "").replace(",", "."));
  return NaN;
}

export function MultiSiteResults({
  results,
  mergedOutput,
  artifactUrl,
  className,
}: MultiSiteResultsProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const columns = useMemo(() => getValueColumns(results), [results]);

  // Sort results
  const sortedResults = useMemo(() => {
    if (!sortKey) return results;
    return [...results].sort((a, b) => {
      const aVal = a.data?.[sortKey];
      const bVal = b.data?.[sortKey];
      if (isNumeric(aVal) && isNumeric(bVal)) {
        const diff = extractNumber(aVal) - extractNumber(bVal);
        return sortDir === "asc" ? diff : -diff;
      }
      const diff = String(aVal || "").localeCompare(String(bVal || ""));
      return sortDir === "asc" ? diff : -diff;
    });
  }, [results, sortKey, sortDir]);

  // Find best/worst for numeric columns
  const columnStats = useMemo(() => {
    const stats: Record<string, { bestIdx: number; worstIdx: number }> = {};
    for (const col of columns) {
      const values = results.map((r, i) => ({ val: extractNumber(r.data?.[col]), i }))
        .filter((v) => !isNaN(v.val));
      if (values.length < 2) continue;
      values.sort((a, b) => a.val - b.val);
      stats[col] = { bestIdx: values[0].i, worstIdx: values[values.length - 1].i };
    }
    return stats;
  }, [results, columns]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleExportCsv = () => {
    if (artifactUrl) {
      window.open(artifactUrl, "_blank");
      return;
    }
    // Generate CSV client-side
    const headers = ["url", "status", ...columns];
    const rows = results.map((r) => [
      r.url,
      r.status,
      ...columns.map((c) => {
        const val = r.data?.[c];
        return typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
      }),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "multi-site-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const completedCount = results.filter((r) => r.status === "completed").length;
  const failedCount = results.filter((r) => r.status !== "completed").length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-teal-400" />
          <h3 className="text-sm font-medium text-foreground">Multi-Site Results</h3>
          <span className="text-[10px] text-muted-foreground">
            {completedCount}/{results.length} completed
            {failedCount > 0 && `, ${failedCount} failed`}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={handleExportCsv} className="h-7">
          <Download className="h-3 w-3 mr-1" />
          CSV
        </Button>
      </div>

      {/* Results Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-zinc-900/50">
                <th className="text-left p-3 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Site</th>
                <th className="text-left p-3 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Status</th>
                {columns.map((col) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="text-left p-3 text-[10px] font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {col}
                      <ArrowUpDown className="h-2.5 w-2.5" />
                    </div>
                  </th>
                ))}
                <th className="text-left p-3 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((result, idx) => {
                const originalIdx = results.indexOf(result);
                return (
                  <tr
                    key={idx}
                    onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                    className={cn(
                      "border-b border-border last:border-0 cursor-pointer transition-colors",
                      expandedRow === idx ? "bg-zinc-900/50" : "hover:bg-zinc-900/30",
                    )}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {columnStats[columns[0]]?.bestIdx === originalIdx && (
                          <Trophy className="h-3 w-3 text-amber-400 shrink-0" />
                        )}
                        <span className="text-foreground truncate max-w-[180px]">{result.url}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      {result.status === "completed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      )}
                    </td>
                    {columns.map((col) => {
                      const val = result.data?.[col];
                      const isBest = columnStats[col]?.bestIdx === originalIdx;
                      const isWorst = columnStats[col]?.worstIdx === originalIdx;
                      const displayVal: string = val !== undefined && val !== null
                        ? (typeof val === "object" ? JSON.stringify(val).slice(0, 50) : String(val))
                        : "";
                      return (
                        <td
                          key={col}
                          className={cn(
                            "p-3",
                            isBest && "text-emerald-400 font-medium",
                            isWorst && "text-red-400",
                            !isBest && !isWorst && "text-foreground",
                          )}
                        >
                          {displayVal || <span className="text-zinc-600">—</span>}
                        </td>
                      );
                    })}
                    <td className="p-3 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {Math.round(result.durationMs / 1000)}s
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expanded row detail */}
      {expandedRow !== null && sortedResults[expandedRow] && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">{sortedResults[expandedRow].url}</span>
            <button onClick={() => setExpandedRow(null)} className="text-zinc-500 hover:text-zinc-300">
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
          {sortedResults[expandedRow].error && (
            <p className="text-xs text-red-400">{sortedResults[expandedRow].error}</p>
          )}
          {sortedResults[expandedRow].data && (
            <pre className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-3 text-[10px] text-zinc-300 overflow-auto max-h-[200px]">
              {JSON.stringify(sortedResults[expandedRow].data, null, 2)}
            </pre>
          )}
          {sortedResults[expandedRow].screenshotUrl && (
            <div>
              <p className="text-[10px] text-zinc-500 mb-1">Screenshot</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sortedResults[expandedRow].screenshotUrl}
                alt={`Screenshot of ${sortedResults[expandedRow].url}`}
                className="rounded-lg border border-zinc-800 max-w-full"
              />
            </div>
          )}
        </div>
      )}

      {/* Merged Output Summary */}
      {mergedOutput && typeof mergedOutput === "object" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <ChevronDown className="h-3.5 w-3.5 text-teal-400" />
            <p className="text-xs font-medium text-foreground">Merged Results</p>
          </div>
          <pre className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-3 text-[10px] text-zinc-300 overflow-auto max-h-[200px]">
            {JSON.stringify(mergedOutput, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
