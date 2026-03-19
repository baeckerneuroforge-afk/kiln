"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  MessageSquare,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

interface ConversationMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "HUMAN";
  content: string;
  imageUrl?: string | null;
  extractedData?: {
    documentType: string;
    fields: Record<string, string | number | null>;
  } | null;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  agentId: string;
  agentName: string;
  sessionId: string;
  visitorName: string | null;
  visitorEmail: string | null;
  firstMessagePreview: string;
  firstMessage: string;
  status: "ACTIVE" | "COMPLETED" | "HANDOFF_REQUESTED" | "HANDOFF_RESPONDED";
  handoffStatus: "REQUESTED" | "RESPONDED" | null;
  messagesCount: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  actionsUsed: string[];
  messages: ConversationMessage[];
}

interface ConversationsResponse {
  conversations: ConversationRow[];
  agents: {
    id: string;
    name: string;
    status: string;
  }[];
  filters: {
    agentId: string;
    status: string;
    dateFrom: string;
    dateTo: string;
    search: string;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

function formatRelativeTime(timestamp: string) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function statusLabel(status: ConversationRow["status"]) {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "HANDOFF_REQUESTED":
      return "Handoff Requested";
    case "HANDOFF_RESPONDED":
      return "Handoff Responded";
    case "COMPLETED":
    default:
      return "Completed";
  }
}

function statusClassName(status: ConversationRow["status"]) {
  switch (status) {
    case "ACTIVE":
      return "bg-blue-500/15 text-blue-300";
    case "HANDOFF_REQUESTED":
      return "bg-amber-500/15 text-amber-300";
    case "HANDOFF_RESPONDED":
      return "bg-emerald-500/15 text-emerald-300";
    case "COMPLETED":
    default:
      return "bg-zinc-500/15 text-zinc-300";
  }
}

function agentColor(name: string) {
  const palette = [
    "bg-kiln-orange",
    "bg-blue-400",
    "bg-emerald-400",
    "bg-pink-400",
    "bg-cyan-400",
    "bg-violet-400",
  ];
  const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

export default function ConversationsPage() {
  const [data, setData] = useState<ConversationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [page, setPage] = useState(1);
  const [agentId, setAgentId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    async function loadConversations() {
      setLoading(true);

      try {
        const params = new URLSearchParams({
          page: String(page),
        });
        if (agentId) params.set("agentId", agentId);
        if (status) params.set("status", status);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        if (search) params.set("search", search);

        const response = await fetch(`/api/conversations?${params.toString()}`, {
          cache: "no-store",
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to load conversations");
        }

        setData(result);
        setError(null);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load conversations");
      } finally {
        setLoading(false);
      }
    }

    loadConversations();
  }, [agentId, dateFrom, dateTo, page, search, status, fetchKey]);

  const activeFilterCount = useMemo(() => {
    return [agentId, status, dateFrom, dateTo, search].filter(Boolean).length;
  }, [agentId, status, dateFrom, dateTo, search]);

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: "csv" });
      if (agentId) params.set("agentId", agentId);
      if (status) params.set("status", status);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (search) params.set("search", search);

      const response = await fetch(`/api/conversations?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to export conversations");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "kiln-conversations.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function resetFilters() {
    setAgentId("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setSearchInput("");
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-kiln-orange">
            Conversations
          </p>
          <h1 className="mt-2 font-serif text-3xl text-foreground">All agent conversations</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Review every conversation across your workspace, filter by agent or status, and export filtered history.
          </p>
        </div>
        <Button
          onClick={exportCsv}
          variant="outline"
          disabled={exporting || (data?.pagination.total || 0) === 0}
        >
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export as CSV
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.6fr,1fr,1fr,1fr,1fr,auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search messages, visitor email, or name"
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <select
            value={agentId}
            onChange={(event) => {
              setAgentId(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All agents</option>
            {data?.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="handoff">Handoff</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <Button variant="outline" onClick={resetFilters} disabled={activeFilterCount === 0}>
            Reset
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            {data?.pagination.total || 0} conversations
            {activeFilterCount > 0 ? ` · ${activeFilterCount} filters active` : ""}
          </p>
          <p>Sorted by newest first</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="hidden grid-cols-[1.25fr,1.15fr,2fr,0.8fr,1.2fr,1fr,0.9fr] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground lg:grid">
          <span>Agent</span>
          <span>Visitor</span>
          <span>First Message</span>
          <span>Messages</span>
          <span>Status</span>
          <span>Started</span>
          <span>Duration</span>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => setFetchKey((k) => k + 1)} />
        ) : data && data.conversations.length > 0 ? (
          <div className="divide-y divide-border">
            {data.conversations.map((conversation) => {
              const isExpanded = expandedId === conversation.id;
              return (
                <div key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : conversation.id)}
                    className="w-full px-5 py-4 text-left transition-colors hover:bg-background/40"
                  >
                    <div className="grid gap-3 lg:grid-cols-[1.25fr,1.15fr,2fr,0.8fr,1.2fr,1fr,0.9fr] lg:items-center">
                      <div className="flex items-center gap-3">
                        <span className={cn("h-2.5 w-2.5 rounded-full", agentColor(conversation.agentName))} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{conversation.agentName}</p>
                          <p className="mt-1 text-xs text-muted-foreground lg:hidden">
                            {conversation.visitorEmail || "Anonymous"}
                          </p>
                        </div>
                      </div>

                      <div className="hidden lg:block">
                        <p className="truncate text-sm text-foreground">
                          {conversation.visitorEmail || "Anonymous"}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{conversation.firstMessagePreview}</p>
                      </div>

                      <div className="text-sm text-foreground">{conversation.messagesCount}</div>

                      <div>
                        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", statusClassName(conversation.status))}>
                          {statusLabel(conversation.status)}
                        </span>
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {formatRelativeTime(conversation.startedAt)}
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">{formatDuration(conversation.durationMs)}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border bg-background/40 px-5 py-5">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Full conversation
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Session {conversation.sessionId} · {conversation.messagesCount} messages
                          </p>
                        </div>
                        <Link href={`/dashboard/agents/${conversation.agentId}?tab=logs`}>
                          <Button variant="outline" size="sm">
                            <MessageSquare className="mr-2 h-3.5 w-3.5" />
                            Open in agent logs
                          </Button>
                        </Link>
                      </div>

                      <div className="space-y-3">
                        {conversation.messages.map((message) => (
                          <div
                            key={message.id}
                            className={cn(
                              "rounded-xl border px-4 py-3",
                              message.role === "USER" && "border-kiln-orange/20 bg-kiln-orange/5",
                              message.role === "ASSISTANT" && "border-border bg-card",
                              message.role === "HUMAN" && "border-emerald-500/20 bg-emerald-500/5",
                              message.role === "SYSTEM" && "border-zinc-800 bg-zinc-950/40"
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {message.role}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(message.createdAt)}
                              </span>
                            </div>
                            {message.imageUrl && !message.imageUrl.includes("kiln-meta") && (
                              <div className="mt-2 mb-1">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={message.imageUrl}
                                  alt="User uploaded"
                                  className="max-h-40 rounded-lg object-contain border border-border"
                                />
                              </div>
                            )}
                            {message.imageUrl?.includes("kiln-meta") && (
                              <p className="mt-2 text-xs text-muted-foreground italic">
                                [Image attached — too large for inline preview]
                              </p>
                            )}
                            {/* Extracted Document Data */}
                            {message.extractedData && (
                              <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                                  Extracted: {message.extractedData.documentType}
                                </p>
                                <div className="grid grid-cols-2 gap-1">
                                  {Object.entries(message.extractedData.fields)
                                    .filter(([, v]) => v !== null)
                                    .map(([key, value]) => (
                                      <div key={key} className="text-xs">
                                        <span className="text-muted-foreground">{key}: </span>
                                        <span className="text-foreground">{String(value)}</span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{message.content}</p>
                          </div>
                        ))}
                      </div>

                      {/* Before/After Image Comparison */}
                      {(() => {
                        const imageMessages = conversation.messages.filter(
                          (m: ConversationMessage) => m.imageUrl && !m.imageUrl.includes("kiln-meta")
                        );
                        if (imageMessages.length < 2) return null;
                        return (
                          <div className="mt-4 rounded-xl border border-border bg-card p-4">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Image Comparison ({imageMessages.length} images)
                            </p>
                            <div className="flex gap-3 overflow-x-auto">
                              {imageMessages.map((msg: ConversationMessage, i: number) => (
                                <div key={msg.id} className="flex-shrink-0 text-center">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={msg.imageUrl!}
                                    alt={`Image ${i + 1}`}
                                    className="h-32 w-32 rounded-lg border border-border object-cover"
                                  />
                                  <p className="mt-1 text-[10px] text-muted-foreground">
                                    {i === 0 ? "Vorher" : i === imageMessages.length - 1 ? "Nachher" : `Image ${i + 1}`}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : activeFilterCount > 0 ? (
          <div className="px-5 py-12 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">No conversations found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try widening your filters or wait for new conversations to come in.
            </p>
          </div>
        ) : (
          <EmptyState
            icon={<MessageSquare className="h-7 w-7 text-muted-foreground" />}
            title="Noch keine Gespräche"
            description="Dein Agent hatte noch keine Gespräche. Binde ihn auf deiner Website ein, um loszulegen."
            actionLabel="Zum Agent"
            actionHref="/dashboard/agents"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Page {data?.pagination.page || 1}
          {data?.pagination.totalPages ? ` of ${data.pagination.totalPages}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={!data?.pagination.hasPreviousPage}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => setPage((current) => current + 1)}
            disabled={!data?.pagination.hasNextPage}
          >
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
