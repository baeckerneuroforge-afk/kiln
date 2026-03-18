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
  FlaskConical,
  HandMetal,
  Send,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LogMessage {
  role: "USER" | "ASSISTANT" | "SYSTEM" | "HUMAN";
  content: string;
  createdAt: string;
}

interface HandoffEntry {
  from: string;
  to: string;
  reason: string;
  at: string;
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
  handoffStatus: string | null;
  handoffAgentName: string | null;
  handoffs: HandoffEntry[];
  messageCount: number;
  createdAt: string;
  messages: LogMessage[];
}

interface LogsTabProps {
  agentId: string;
  onAddTestCase?: (inputMessage: string, expectedResponse: string) => void;
}

export function LogsTab({ agentId, onAddTestCase }: LogsTabProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [replyInputs, setReplyInputs] = useState<Map<string, string>>(new Map());
  const [sendingReply, setSendingReply] = useState<string | null>(null);

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

  async function sendReply(logId: string) {
    const content = replyInputs.get(logId)?.trim();
    if (!content) return;
    setSendingReply(logId);
    try {
      const res = await fetch(`/api/agents/${agentId}/conversations/${logId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const msg = await res.json();
        // Add message to local state
        setLogs((prev) =>
          prev.map((log) =>
            log.id === logId
              ? {
                  ...log,
                  handoffStatus: "RESPONDED",
                  messages: [...log.messages, { role: "HUMAN" as const, content: msg.content, createdAt: msg.createdAt }],
                  messageCount: log.messageCount + 1,
                }
              : log
          )
        );
        setReplyInputs((prev) => {
          const next = new Map(prev);
          next.delete(logId);
          return next;
        });
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setSendingReply(null);
    }
  }

  const actionOptions = [
    "BOOK_APPOINTMENT",
    "COLLECT_EMAIL",
    "SCORE_LEAD",
    "HANDOFF_AGENT",
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {new Date(log.createdAt).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {log.handoffStatus === "REQUESTED" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        <HandMetal className="h-2.5 w-2.5" />
                        Handoff
                      </span>
                    )}
                    {log.handoffStatus === "RESPONDED" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                        <UserCheck className="h-2.5 w-2.5" />
                        Replied
                      </span>
                    )}
                    {log.handoffAgentName && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                        {"\u{1F504}"} → {log.handoffAgentName}
                      </span>
                    )}
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
                    {/* Handoff timeline markers */}
                    {log.handoffs && log.handoffs.length > 0 && (
                      <div className="space-y-1.5 mb-3 pb-3 border-b border-border/50">
                        {log.handoffs.map((h, hi) => (
                          <div key={hi} className="flex items-center gap-2 rounded-lg bg-blue-500/5 border border-blue-500/10 px-3 py-2">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                              <span className="text-[10px]">{"\u{1F504}"}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-blue-400">
                                {h.from} → {h.to}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {h.reason}
                              </p>
                            </div>
                            <span className="text-[10px] text-muted-foreground/50 shrink-0">
                              {new Date(h.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {log.messages.map((msg, i) => {
                      // Nächste Assistant-Nachricht für "Add as test case"
                      const nextAssistant = msg.role === "USER"
                        ? log.messages.slice(i + 1).find((m) => m.role === "ASSISTANT")
                        : null;

                      return (
                      <div key={i} className="flex items-start gap-2">
                        <div className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          msg.role === "USER" ? "bg-muted" :
                          msg.role === "HUMAN" ? "bg-emerald-500/10" :
                          "bg-kiln-orange/10"
                        )}>
                          {msg.role === "USER" ? (
                            <User className="h-3 w-3 text-muted-foreground" />
                          ) : msg.role === "HUMAN" ? (
                            <UserCheck className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Bot className="h-3 w-3 text-kiln-orange" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {msg.role === "USER" ? "User" : msg.role === "HUMAN" ? "Human" : "Agent"}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50">
                              {new Date(msg.createdAt).toLocaleTimeString("de-DE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {msg.role === "USER" && nextAssistant && onAddTestCase && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddTestCase(msg.content, nextAssistant.content);
                                }}
                                className="flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400 hover:bg-purple-500/20 transition-colors"
                              >
                                <FlaskConical className="h-2.5 w-2.5" />
                                Add as test case
                              </button>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words">
                            {msg.content.length > 500
                              ? msg.content.slice(0, 500) + "..."
                              : msg.content}
                          </p>
                        </div>
                      </div>
                      );
                    })}

                    {/* Reply Input — shown for conversations with handoff */}
                    {log.handoffStatus && (
                      <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                          <UserCheck className="h-3 w-3 text-emerald-400" />
                        </div>
                        <input
                          type="text"
                          value={replyInputs.get(log.id) || ""}
                          onChange={(e) => {
                            setReplyInputs((prev) => {
                              const next = new Map(prev);
                              next.set(log.id, e.target.value);
                              return next;
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              sendReply(log.id);
                            }
                          }}
                          placeholder="Type a human reply..."
                          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <button
                          onClick={() => sendReply(log.id)}
                          disabled={!replyInputs.get(log.id)?.trim() || sendingReply === log.id}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white transition-opacity disabled:opacity-40"
                        >
                          {sendingReply === log.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    )}
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
