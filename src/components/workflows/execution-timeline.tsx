"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Check,
  AlertTriangle,
  Clock,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Wrench,
  Terminal,
  List,
  GripHorizontal,
  Filter,
  Monitor,
  Play,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ========== Types ========== */

export interface BrowserReplayEvent {
  eventType: string;
  timestamp: number;
  url?: string;
  imageData?: string;
  message?: string;
  action?: string;
  stepIndex?: number;
  _screenshotDropped?: boolean;
  [key: string]: unknown;
}

export interface TimelineNodeEntry {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  status: "completed" | "failed" | "running" | "skipped" | "pending";
  durationMs?: number;
  credits?: number;
  error?: {
    type: string;
    message: string;
    suggestions?: string[];
  };
  input?: unknown;
  output?: unknown;
  startedAt?: string;
  meta?: Record<string, unknown>;
}

export interface ExecutionTimelineData {
  status: "idle" | "running" | "completed" | "failed";
  totalDurationMs?: number;
  totalCredits?: number;
  entries: TimelineNodeEntry[];
  logs?: ConsoleLogEntry[];
}

export interface ConsoleLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  nodeId?: string;
}

interface ExecutionTimelinePanelProps {
  data: ExecutionTimelineData | null;
  onNodeClick?: (nodeId: string) => void;
  onNodeFix?: (nodeId: string) => void;
  onHighlightNode?: (nodeId: string) => void;
}

/* ========== Helpers ========== */

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <Check className="h-3 w-3 text-green-400" />;
    case "failed":
      return <AlertTriangle className="h-3 w-3 text-red-400" />;
    case "running":
      return (
        <div className="h-3 w-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
      );
    case "skipped":
      return <span className="text-[10px] text-muted-foreground">⊘</span>;
    case "pending":
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    default:
      return null;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "text-green-400";
    case "failed": return "text-red-400";
    case "running": return "text-orange-400";
    case "skipped": return "text-muted-foreground";
    default: return "text-muted-foreground";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "completed": return "Done";
    case "failed": return "Error";
    case "running": return "Running";
    case "skipped": return "Skipped";
    case "pending": return "Waiting";
    default: return status;
  }
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-amber-400",
  error: "text-red-400",
  success: "text-green-400",
};

/* ========== Browser Replay ========== */

function BrowserReplayPanel({ events }: { events: BrowserReplayEvent[] }) {
  const screenshots = events.filter((e) => e.eventType === "browser" && e.imageData);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-play effect
  useEffect(() => {
    if (playing && screenshots.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentIdx((prev) => {
          if (prev >= screenshots.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, screenshots.length]);

  if (screenshots.length === 0) {
    // Show progress events only
    const progressEvents = events.filter((e) => e.eventType === "progress");
    if (progressEvents.length === 0) return null;

    return (
      <div className="px-6 py-2 bg-card border-t border-border">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Monitor className="h-3 w-3 text-orange-400/60" />
          <span className="text-[10px] font-medium text-muted-foreground">Browser Steps</span>
        </div>
        <div className="space-y-0.5">
          {progressEvents.slice(-8).map((e, i) => (
            <p key={i} className="text-[10px] text-muted-foreground font-mono truncate">
              {e.message}
            </p>
          ))}
        </div>
      </div>
    );
  }

  const current = screenshots[currentIdx];
  const progressAtStep = events.filter(
    (e) => e.eventType === "progress" && e.timestamp <= (current?.timestamp || Infinity),
  );
  const lastProgress = progressAtStep[progressAtStep.length - 1];

  return (
    <div className="px-6 py-2 bg-card border-t border-border">
      <div className="flex items-center gap-2 mb-2">
        <Monitor className="h-3 w-3 text-orange-400/60" />
        <span className="text-[10px] font-medium text-muted-foreground">Browser Replay</span>
        <span className="text-[10px] text-muted-foreground">
          {currentIdx + 1}/{screenshots.length}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setCurrentIdx((p) => Math.max(0, p - 1)); setPlaying(false); }}
            disabled={currentIdx === 0}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:text-muted-foreground transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            onClick={() => setPlaying(!playing)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
          <button
            onClick={() => { setCurrentIdx((p) => Math.min(screenshots.length - 1, p + 1)); setPlaying(false); }}
            disabled={currentIdx >= screenshots.length - 1}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:text-muted-foreground transition-colors"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
      {/* Screenshot */}
      <div className="relative rounded border border-border overflow-hidden bg-black/50" style={{ maxHeight: 200 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${current?.imageData}`}
          alt={`Step ${currentIdx + 1}`}
          className="w-full h-auto object-contain"
          style={{ maxHeight: 200 }}
        />
        {current?.url && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-0.5">
            <span className="text-[9px] text-muted-foreground font-mono truncate block">{current.url as string}</span>
          </div>
        )}
      </div>
      {lastProgress && (
        <p className="text-[10px] text-muted-foreground mt-1 truncate">{lastProgress.message}</p>
      )}
    </div>
  );
}

/* ========== Component ========== */

export function ExecutionTimelinePanel({
  data,
  onNodeClick,
  onNodeFix,
  onHighlightNode,
}: ExecutionTimelinePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "console">("timeline");
  const [panelHeight, setPanelHeight] = useState(260);
  const [replayNodeId, setReplayNodeId] = useState<string | null>(null);
  const [logFilters, setLogFilters] = useState({ info: true, warn: true, error: true, success: true });
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Auto-expand on new execution
  useEffect(() => {
    if (data && data.status !== "idle" && data.entries.length > 0) {
      setExpanded(true);
    }
  }, [data?.status, data?.entries.length]);

  // Auto-scroll console
  useEffect(() => {
    if (activeTab === "console" && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.logs?.length, activeTab]);

  // Resize drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: panelHeight };
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const newH = Math.max(150, Math.min(500, dragRef.current.startHeight + delta));
      setPanelHeight(newH);
    };
    const handleUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [panelHeight]);

  const handleCopyLogs = useCallback(() => {
    if (!data?.logs) return;
    const text = data.logs
      .map((l) => `[${l.timestamp}] ${l.level.toUpperCase()}: ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
  }, [data?.logs]);

  if (!data || (data.status === "idle" && data.entries.length === 0)) return null;

  const succeededCount = data.entries.filter((e) => e.status === "completed").length;
  const failedEntry = data.entries.find((e) => e.status === "failed");
  const totalNodes = data.entries.length;

  // Summary bar text
  const summaryText =
    data.status === "running"
      ? `Running... (${succeededCount}/${totalNodes} nodes)`
      : data.status === "completed"
        ? `✓ Success (${formatDuration(data.totalDurationMs)}, ${data.totalCredits ?? 0} credits)`
        : data.status === "failed" && failedEntry
          ? `✗ Failed at ${failedEntry.nodeLabel} (${formatDuration(data.totalDurationMs)})`
          : `✗ Failed (${formatDuration(data.totalDurationMs)})`;

  const filteredLogs = data.logs?.filter((l) => logFilters[l.level as keyof typeof logFilters]) ?? [];

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex flex-col border-t border-border bg-card shadow-2xl shadow-black/40 transition-all duration-200"
      style={{ height: expanded ? panelHeight : 36 }}
    >
      {/* Resize handle */}
      {expanded && (
        <div
          className="absolute -top-1.5 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center group"
          onMouseDown={handleDragStart}
        >
          <GripHorizontal className="h-3 w-3 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
        </div>
      )}

      {/* Collapsed summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-4 py-2 text-left hover:bg-card transition-colors shrink-0"
      >
        <div className={cn(
          "h-2 w-2 rounded-full shrink-0",
          data.status === "running" && "bg-orange-400 animate-pulse",
          data.status === "completed" && "bg-green-400",
          data.status === "failed" && "bg-red-400",
        )} />
        <span className="text-[11px] font-medium text-foreground flex-1">
          Last run: {summaryText}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tabs */}
          <div className="flex items-center border-b border-border px-4 shrink-0">
            <button
              onClick={() => setActiveTab("timeline")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors",
                activeTab === "timeline"
                  ? "text-orange-400 border-orange-500"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              <List className="h-3 w-3" />
              Timeline
            </button>
            <button
              onClick={() => setActiveTab("console")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors",
                activeTab === "console"
                  ? "text-orange-400 border-orange-500"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              <Terminal className="h-3 w-3" />
              Console
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setExpanded(false)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Timeline tab */}
          {activeTab === "timeline" && (
            <div className="flex-1 overflow-auto scrollbar-thin">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-muted-foreground text-left border-b border-border">
                    <th className="px-4 py-1.5 w-8 font-medium">#</th>
                    <th className="px-2 py-1.5 font-medium">Node</th>
                    <th className="px-2 py-1.5 w-20 font-medium">Status</th>
                    <th className="px-2 py-1.5 w-16 font-medium text-right">Duration</th>
                    <th className="px-2 py-1.5 w-14 font-medium text-right">Credits</th>
                    <th className="px-4 py-1.5 w-16 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry, idx) => {
                    const browserEvents = (entry.meta?._browserEvents ?? []) as BrowserReplayEvent[];
                    const hasBrowserReplay = entry.nodeType === "computer_use" && browserEvents.length > 0;
                    const isReplayOpen = replayNodeId === entry.nodeId;

                    return (
                      <React.Fragment key={entry.nodeId}>
                        <tr
                          className={cn(
                            "border-b border-border hover:bg-card transition-colors cursor-pointer",
                            entry.status === "failed" && "bg-red-500/[0.03]",
                            isReplayOpen && "bg-card",
                          )}
                          onClick={() => onHighlightNode?.(entry.nodeId)}
                        >
                          <td className="px-4 py-2 text-muted-foreground font-mono">{idx + 1}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              {statusIcon(entry.status)}
                              <span className="text-foreground font-medium truncate max-w-[180px]">
                                {entry.nodeLabel}
                              </span>
                            </div>
                            {/* Inline error for failed nodes */}
                            {entry.status === "failed" && entry.error && (
                              <div className="mt-1 ml-5">
                                <p className="text-[10px] text-red-400/80 truncate max-w-[250px]">
                                  {entry.error.message}
                                </p>
                              </div>
                            )}
                          </td>
                          <td className={cn("px-2 py-2 font-medium", statusColor(entry.status))}>
                            {statusLabel(entry.status)}
                          </td>
                          <td className="px-2 py-2 text-right text-muted-foreground font-mono">
                            {formatDuration(entry.durationMs)}
                          </td>
                          <td className="px-2 py-2 text-right text-muted-foreground font-mono">
                            {entry.credits ?? 0}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              {hasBrowserReplay && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setReplayNodeId(isReplayOpen ? null : entry.nodeId); }}
                                  className={cn(
                                    "p-1 rounded transition-colors",
                                    isReplayOpen
                                      ? "text-orange-400 bg-orange-500/10"
                                      : "text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10",
                                  )}
                                  title="Browser replay"
                                >
                                  <Monitor className="h-3 w-3" />
                                </button>
                              )}
                              {(entry.status === "completed" || entry.status === "failed") && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onNodeClick?.(entry.nodeId); }}
                                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                                  title="View output"
                                >
                                  <Eye className="h-3 w-3" />
                                </button>
                              )}
                              {entry.status === "failed" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onNodeFix?.(entry.nodeId); }}
                                  className="p-1 rounded text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                  title="Fix this node"
                                >
                                  <Wrench className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Browser replay panel — expandable below the row */}
                        {isReplayOpen && hasBrowserReplay && (
                          <tr>
                            <td colSpan={6} className="p-0">
                              <BrowserReplayPanel events={browserEvents} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {/* Summary row */}
              {data.entries.length > 0 && (
                <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
                  <span>Total: {formatDuration(data.totalDurationMs)}</span>
                  <span>{data.totalCredits ?? 0} credits</span>
                  <span>{succeededCount} of {totalNodes} nodes succeeded</span>
                </div>
              )}
            </div>
          )}

          {/* Console tab */}
          {activeTab === "console" && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Console toolbar */}
              <div className="flex items-center gap-2 px-4 py-1 border-b border-border shrink-0">
                <Filter className="h-3 w-3 text-muted-foreground" />
                {(["error", "warn", "info", "success"] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setLogFilters((f) => ({ ...f, [level]: !f[level] }))}
                    className={cn(
                      "text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors",
                      logFilters[level]
                        ? cn("border", level === "error" ? "bg-red-500/10 text-red-400 border-red-500/20" : level === "warn" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : level === "success" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-muted/10 text-muted-foreground border-border")
                        : "text-muted-foreground hover:text-muted-foreground"
                    )}
                  >
                    {level}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  onClick={handleCopyLogs}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  Copy All
                </button>
              </div>

              {/* Console output */}
              <div className="flex-1 overflow-auto bg-card font-mono text-[11px] p-3 space-y-0.5 scrollbar-thin">
                {filteredLogs.length === 0 ? (
                  <p className="text-muted-foreground italic">No logs yet. Run the workflow to see execution logs.</p>
                ) : (
                  filteredLogs.map((log, i) => (
                    <div key={i} className="flex gap-2 leading-relaxed">
                      <span className="text-muted-foreground shrink-0 select-none">[{log.timestamp}]</span>
                      <span className={LOG_LEVEL_COLORS[log.level] || "text-muted-foreground"}>{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={consoleEndRef} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
