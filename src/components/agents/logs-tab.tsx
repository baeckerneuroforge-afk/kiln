"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Download,
  Loader2,
  ChevronDown,
  ChevronRight,
  Bot,
  User,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LogMessage {
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
}

interface LogEntry {
  id: string;
  sessionId: string;
  channel: string;
  leadScore: number | null;
  sentiment: number | null;
  actionsUsed: string[];
  visitorName: string | null;
  visitorEmail: string | null;
  messageCount: number;
  createdAt: string;
  messages: LogMessage[];
}

interface LogsTabProps {
  agentId: string;
}

export function LogsTab({ agentId }: LogsTabProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");
  const [action, setAction] = useState("");
  const [channel, setChannel] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (scoreMin) params.set("scoreMin", scoreMin);
    if (scoreMax) params.set("scoreMax", scoreMax);
    if (action) params.set("action", action);
    if (channel) params.set("channel", channel);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }, [search, scoreMin, scoreMax, action, channel, dateFrom, dateTo]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const query = buildQuery();
      const res = await fetch(`/api/agents/${agentId}/logs?${query}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.conversations);
        setTotal(data.total);
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setLoading(false);
    }
  }, [agentId, buildQuery]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  async function exportCSV() {
    setExporting(true);
    try {
      const query = buildQuery();
      const res = await fetch(`/api/agents/${agentId}/logs?${query}&format=csv`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `agent-logs-${agentId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setExporting(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const actionOptions = [
    "BOOK_APPOINTMENT",
    "COLLECT_EMAIL",
    "SCORE_LEAD",
  ];

  const channelOptions = [
    "WEB", "WHATSAPP", "INSTAGRAM", "TELEGRAM", "VOICE", "SLACK", "EMAIL",
  ];

  return (
    <div className="space-y-4">
      {/* Header with Search, Filters, Export */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-64 rounded-lg border border-border bg-background py-1.5 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && "border-primary text-primary")}
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            Filters
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{total} conversations</span>
          <Button
            size="sm"
            variant="outline"
            onClick={exportCSV}
            disabled={exporting || logs.length === 0}
          >
            {exporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {/* Lead Score */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Score Min
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={scoreMin}
                onChange={(e) => setScoreMin(e.target.value)}
                placeholder="1"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Score Max
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={scoreMax}
                onChange={(e) => setScoreMax(e.target.value)}
                placeholder="10"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Action */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Action
              </label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>{a.replace(/_/g, " ").toLowerCase()}</option>
                ))}
              </select>
            </div>

            {/* Channel */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Channel
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All</option>
                {channelOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={loadLogs}>
              Apply Filters
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setScoreMin(""); setScoreMax(""); setAction("");
                setChannel(""); setDateFrom(""); setDateTo("");
                setSearch("");
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Logs List */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">No conversations match your filters.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card">
          {/* Table Header */}
          <div className="grid grid-cols-[24px_1fr_100px_60px_60px_1fr_70px] gap-2 border-b border-border px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            <div />
            <div>Date</div>
            <div>Visitor</div>
            <div>Msgs</div>
            <div>Score</div>
            <div>Actions</div>
            <div>Channel</div>
          </div>

          {logs.map((log) => {
            const isExpanded = expandedIds.has(log.id);
            return (
              <div key={log.id} className="border-b border-border/50 last:border-0">
                <button
                  onClick={() => toggleExpand(log.id)}
                  className="grid w-full grid-cols-[24px_1fr_100px_60px_60px_1fr_70px] gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="truncate">
                    {log.visitorEmail ? (
                      <span className="text-xs text-foreground">{log.visitorEmail}</span>
                    ) : log.visitorName ? (
                      <span className="text-xs text-foreground">{log.visitorName}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">Anonymous</span>
                    )}
                  </div>
                  <div className="text-xs text-foreground">{log.messageCount}</div>
                  <div>
                    {log.leadScore ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          log.leadScore >= 7
                            ? "bg-kiln-green/10 text-kiln-green"
                            : log.leadScore >= 4
                            ? "bg-yellow-500/10 text-yellow-500"
                            : "bg-red-500/10 text-red-500"
                        )}
                      >
                        {log.leadScore}/10
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {log.actionsUsed.length > 0 ? (
                      log.actionsUsed.map((a) => (
                        <span
                          key={a}
                          className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {a.replace(/_/g, " ").toLowerCase()}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{log.channel}</div>
                </button>

                {/* Expanded Messages */}
                {isExpanded && log.messages.length > 0 && (
                  <div className="mx-4 mb-3 space-y-2 rounded-lg border border-border/50 bg-background p-3">
                    {log.messages.map((msg, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          msg.role === "USER" ? "bg-muted" : "bg-kiln-orange/10"
                        )}>
                          {msg.role === "USER" ? (
                            <User className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Bot className="h-3 w-3 text-kiln-orange" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {msg.role === "USER" ? "User" : "Agent"}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50">
                              {new Date(msg.createdAt).toLocaleTimeString("de-DE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words">
                            {msg.content.length > 500
                              ? msg.content.slice(0, 500) + "..."
                              : msg.content}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
