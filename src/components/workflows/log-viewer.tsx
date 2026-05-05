"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Search,
  Download,
  Filter,
  Clock,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface LogEntry {
  id: string;
  nodeId: string | null;
  nodeType: string | null;
  taskTitle: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  model: string | null;
  estimatedCost: number | null;
  output: string | null;
  error: string | null;
  input: Record<string, unknown> | null;
  structuredOutput: Record<string, unknown> | null;
}

interface LogViewerProps {
  teamId: string;
  executionId: string | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS = ["COMPLETED", "FAILED", "SKIPPED", "PENDING", "RUNNING"];
const NODE_TYPE_OPTIONS = [
  "agent",
  "trigger_webhook",
  "trigger_schedule",
  "trigger_lead",
  "trigger_chat",
  "trigger_manual",
  "if_condition",
  "switch",
  "filter",
  "transform",
  "http_request",
  "send_email",
  "send_slack",
  "delay",
  "set_variable",
  "approval_gate",
  "wait_webhook",
  "wait_form",
  "sub_workflow",
  "merge",
];

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatCost(cost: number | null): string {
  if (cost === null) return "—";
  if (cost < 0.001) return "<$0.001";
  return `$${cost.toFixed(4)}`;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    COMPLETED: { color: "text-green-400 bg-green-500/10 border-green-500/20", icon: <CheckCircle2 className="h-3 w-3" /> },
    FAILED: { color: "text-red-400 bg-red-500/10 border-red-500/20", icon: <AlertCircle className="h-3 w-3" /> },
    SKIPPED: { color: "text-muted-foreground bg-muted/10 border-border", icon: <Clock className="h-3 w-3" /> },
    PENDING: { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: <Clock className="h-3 w-3" /> },
    RUNNING: { color: "text-blue-400 bg-blue-500/10 border-blue-500/20", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  };
  const c = config[status] || config.PENDING;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border", c.color)}>
      {c.icon}
      {status}
    </span>
  );
}

export function LogViewer({ teamId, executionId, open, onClose }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!executionId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (nodeTypeFilter) params.set("nodeType", nodeTypeFilter);

      const res = await fetch(
        `/api/teams/${teamId}/executions/${executionId}/logs?${params.toString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } finally {
      setLoading(false);
    }
  }, [teamId, executionId, search, statusFilter, nodeTypeFilter]);

  useEffect(() => {
    if (open && executionId) {
      fetchLogs();
    }
  }, [open, executionId, fetchLogs]);

  const handleExport = useCallback(
    async (format: "json" | "csv") => {
      if (!executionId) return;
      const params = new URLSearchParams({ format });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (nodeTypeFilter) params.set("nodeType", nodeTypeFilter);

      const res = await fetch(
        `/api/teams/${teamId}/executions/${executionId}/logs?${params.toString()}`
      );
      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `execution-${executionId}-logs.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [teamId, executionId, search, statusFilter, nodeTypeFilter]
  );

  // Summary stats
  const stats = useMemo(() => {
    const totalDuration = logs.reduce((sum, l) => sum + (l.durationMs || 0), 0);
    const totalTokensIn = logs.reduce((sum, l) => sum + (l.tokensIn || 0), 0);
    const totalTokensOut = logs.reduce((sum, l) => sum + (l.tokensOut || 0), 0);
    const totalCost = logs.reduce((sum, l) => sum + (l.estimatedCost || 0), 0);
    const errors = logs.filter((l) => l.status === "FAILED").length;
    return { totalDuration, totalTokensIn, totalTokensOut, totalCost, errors, total: logs.length };
  }, [logs]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-20 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[680px] z-30 bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileJson className="h-4 w-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-foreground">Execution Logs</h3>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {stats.total} entries
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport("json")}
              className="h-7 text-[11px]"
            >
              <Download className="h-3 w-3 mr-1" />
              JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport("csv")}
              className="h-7 text-[11px]"
            >
              <FileSpreadsheet className="h-3 w-3 mr-1" />
              CSV
            </Button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-5 py-2 border-b border-border bg-background/50 flex items-center gap-4">
          <div className="text-[10px] text-muted-foreground">
            <span className="text-foreground">{formatDuration(stats.totalDuration)}</span> total
          </div>
          <div className="text-[10px] text-muted-foreground">
            <span className="text-foreground">{(stats.totalTokensIn + stats.totalTokensOut).toLocaleString()}</span> tokens
          </div>
          <div className="text-[10px] text-muted-foreground">
            <span className="text-foreground">{formatCost(stats.totalCost)}</span> cost
          </div>
          {stats.errors > 0 && (
            <div className="text-[10px] text-red-400">
              {stats.errors} error{stats.errors !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Search & Filters */}
        <div className="px-5 py-3 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
                placeholder="Search logs..."
                className="w-full bg-muted border border-border rounded-lg text-xs text-foreground pl-8 pr-3 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors",
                showFilters
                  ? "border-orange-500/30 bg-orange-500/5 text-orange-400"
                  : "border-border bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Filter className="h-3 w-3" />
              Filter
              <ChevronDown className={cn("h-3 w-3 transition-transform", showFilters && "rotate-180")} />
            </button>
          </div>

          {showFilters && (
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-muted border border-border rounded-lg text-[11px] text-foreground px-2 py-1.5 outline-none focus:border-orange-500/60"
              >
                <option value="">All status</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={nodeTypeFilter}
                onChange={(e) => setNodeTypeFilter(e.target.value)}
                className="bg-muted border border-border rounded-lg text-[11px] text-foreground px-2 py-1.5 outline-none focus:border-orange-500/60"
              >
                <option value="">All node types</option>
                {NODE_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {(statusFilter || nodeTypeFilter) && (
                <button
                  onClick={() => { setStatusFilter(""); setNodeTypeFilter(""); }}
                  className="text-[10px] text-orange-400 hover:text-orange-300"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileJson className="h-6 w-6 mb-2" />
              <p className="text-xs">No log entries found</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={cn(
                    "px-5 py-3 hover:bg-muted/30 transition-colors cursor-pointer",
                    expandedLog === log.id && "bg-muted/20"
                  )}
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  {/* Kompakte Zeile */}
                  <div className="flex items-center gap-3">
                    <StatusBadge status={log.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground truncate">
                          {log.taskTitle}
                        </span>
                        {log.nodeType && (
                          <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1 py-0.5 rounded">
                            {log.nodeType}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
                      {log.durationMs !== null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatDuration(log.durationMs)}
                        </span>
                      )}
                      {(log.tokensIn || log.tokensOut) ? (
                        <span>{((log.tokensIn || 0) + (log.tokensOut || 0)).toLocaleString()} tok</span>
                      ) : null}
                      {log.estimatedCost ? (
                        <span>{formatCost(log.estimatedCost)}</span>
                      ) : null}
                    </div>
                  </div>

                  {/* Error preview */}
                  {log.error && expandedLog !== log.id && (
                    <p className="text-[10px] text-red-400 mt-1 truncate">{log.error}</p>
                  )}

                  {/* Expanded detail */}
                  {expandedLog === log.id && (
                    <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                      <div className="grid grid-cols-2 gap-3 text-[10px]">
                        <div>
                          <span className="text-muted-foreground">Node ID:</span>{" "}
                          <span className="text-foreground font-mono">{log.nodeId || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Model:</span>{" "}
                          <span className="text-foreground">{log.model || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Started:</span>{" "}
                          <span className="text-foreground">
                            {log.startedAt ? new Date(log.startedAt).toLocaleString() : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Completed:</span>{" "}
                          <span className="text-foreground">
                            {log.completedAt ? new Date(log.completedAt).toLocaleString() : "—"}
                          </span>
                        </div>
                      </div>

                      {log.error && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5">
                          <p className="text-[10px] font-medium text-red-400 mb-1">Error</p>
                          <pre className="text-[10px] text-red-300 font-mono whitespace-pre-wrap break-all">
                            {log.error}
                          </pre>
                        </div>
                      )}

                      {log.output && (
                        <div className="rounded-lg border border-border/40 bg-muted/30 p-2.5">
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">Output</p>
                          <pre className="text-[10px] text-foreground font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                            {log.output}
                          </pre>
                        </div>
                      )}

                      {log.structuredOutput && Object.keys(log.structuredOutput).length > 0 && (
                        <div className="rounded-lg border border-border/40 bg-muted/30 p-2.5">
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">Structured Output</p>
                          <pre className="text-[10px] text-foreground font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                            {JSON.stringify(log.structuredOutput, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.input && Object.keys(log.input).length > 0 && (
                        <div className="rounded-lg border border-border/40 bg-muted/30 p-2.5">
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">Input / Meta</p>
                          <pre className="text-[10px] text-foreground font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                            {JSON.stringify(log.input, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
