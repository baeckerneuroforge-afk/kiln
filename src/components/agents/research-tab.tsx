"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Search,
  Check,
  X,
  ExternalLink,
  Sparkles,
  Edit3,
  Lightbulb,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

interface SourceDetail {
  url: string;
  title: string;
  snippet: string;
  trustScore: number;
}

interface ResearchEntry {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  sourcesDetailed: SourceDetail[] | null;
  confidenceScore: number | null;
  conflictsWith: string | null;
  conflictingContent?: string | null;
  status: "DRAFT" | "APPROVED" | "REJECTED" | "CONFLICT";
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
}

interface ResearchTabProps {
  agentId: string;
}

function TrustBadge({ score }: { score: number }) {
  if (score >= 80) {
    return (
      <span className="inline-flex items-center gap-0.5 text-green-400">
        <ShieldCheck className="h-3 w-3" />
        <span className="text-[10px] font-medium">{score}</span>
      </span>
    );
  }
  if (score >= 60) {
    return (
      <span className="inline-flex items-center gap-0.5 text-yellow-400">
        <Shield className="h-3 w-3" />
        <span className="text-[10px] font-medium">{score}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-red-400">
      <ShieldAlert className="h-3 w-3" />
      <span className="text-[10px] font-medium">{score}</span>
    </span>
  );
}

function ConfidenceBadge({ score, sourceCount }: { score: number; sourceCount: number }) {
  const color =
    score >= 80 ? "text-green-400 bg-green-500/10" :
    score >= 60 ? "text-yellow-400 bg-yellow-500/10" :
    "text-red-400 bg-red-500/10";

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", color)}>
      <Zap className="h-2.5 w-2.5" />
      Confidence: {score}%
      {sourceCount > 0 && ` (${sourceCount} source${sourceCount !== 1 ? "s" : ""})`}
    </span>
  );
}

export function ResearchTab({ agentId }: ResearchTabProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<ResearchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftCount, setDraftCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [agenticRagEnabled, setAgenticRagEnabled] = useState(false);
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(false);
  const [minConfidence, setMinConfidence] = useState(90);
  const [filter, setFilter] = useState<"all" | "DRAFT" | "APPROVED" | "REJECTED" | "CONFLICT">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedAnswer, setEditedAnswer] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [togglingRag, setTogglingRag] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const statusParam = filter !== "all" ? `?status=${filter}` : "";
      const response = await fetch(`/api/agents/${agentId}/research${statusParam}`);
      const data = await response.json();
      if (response.ok) {
        setEntries(data.entries || []);
        setDraftCount(data.draftCount || 0);
        setConflictCount(data.conflictCount || 0);
        setAgenticRagEnabled(data.agenticRagEnabled ?? false);
        setAutoApproveEnabled(data.autoApproveEnabled ?? false);
        setMinConfidence(data.minConfidence ?? 90);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [agentId, filter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleAction = async (
    entryId: string,
    action: "approve" | "reject" | "resolve_conflict",
    edited?: string,
    resolution?: "keep_existing" | "replace" | "keep_both"
  ) => {
    setActionLoading(entryId);
    try {
      const response = await fetch(`/api/agents/${agentId}/research/${entryId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, editedAnswer: edited, resolution }),
      });
      const data = await response.json();
      if (response.ok) {
        const messages: Record<string, string> = {
          approve: "Added to Knowledge Base",
          reject: "Research rejected",
          resolve_conflict: "Conflict resolved",
        };
        toast(messages[action] || "Done", action === "reject" ? "info" : "success");
        setEditingId(null);
        fetchEntries();
      } else {
        toast(data.error || "Action failed", "error");
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleAgenticRag = async () => {
    setTogglingRag(true);
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableAgenticRag: !agenticRagEnabled }),
      });
      if (response.ok) {
        setAgenticRagEnabled(!agenticRagEnabled);
        toast(
          !agenticRagEnabled ? "Self-Learning enabled" : "Self-Learning disabled",
          "success"
        );
      }
    } catch {
      toast("Failed to update setting", "error");
    } finally {
      setTogglingRag(false);
    }
  };

  const toggleAutoApprove = async () => {
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agenticRagAutoApprove: !autoApproveEnabled }),
      });
      if (response.ok) {
        setAutoApproveEnabled(!autoApproveEnabled);
        toast(
          !autoApproveEnabled ? "Auto-approve enabled" : "Auto-approve disabled",
          "success"
        );
      }
    } catch {
      toast("Failed to update setting", "error");
    }
  };

  const updateMinConfidence = async (value: number) => {
    setMinConfidence(value);
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agenticRagMinConfidence: value }),
      });
    } catch {
      // silent
    }
  };

  const filters: { id: typeof filter; label: string; count?: number }[] = [
    { id: "all", label: "All" },
    { id: "DRAFT", label: "Pending Review", count: draftCount },
    { id: "CONFLICT", label: "Conflicts", count: conflictCount },
    { id: "APPROVED", label: "Approved" },
    { id: "REJECTED", label: "Rejected" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toggle Card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <Lightbulb className="h-4.5 w-4.5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Self-Learning</h3>
              <p className="text-sm text-muted-foreground">
                When your agent can&apos;t answer a question, it will research the answer online and suggest adding it to your Knowledge Base.
              </p>
            </div>
          </div>
          <button
            onClick={toggleAgenticRag}
            disabled={togglingRag}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              agenticRagEnabled ? "bg-purple-500" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform",
                agenticRagEnabled ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {/* Auto-Approve Settings */}
      {agenticRagEnabled && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                <Zap className="h-4.5 w-4.5 text-green-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Auto-approve high-confidence answers</h3>
                <p className="text-sm text-muted-foreground">
                  Automatically add researched answers to your Knowledge Base without manual review.
                </p>
              </div>
            </div>
            <button
              onClick={toggleAutoApprove}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                autoApproveEnabled ? "bg-green-500" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform",
                  autoApproveEnabled ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {autoApproveEnabled && (
            <>
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                <p className="text-xs text-yellow-400/80">
                  When enabled, your agent will automatically add researched answers to the Knowledge Base without your review if confidence is above the threshold.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Minimum confidence threshold</label>
                  <span className="text-xs font-mono text-foreground">{minConfidence}%</span>
                </div>
                <input
                  type="range"
                  min={70}
                  max={100}
                  value={minConfidence}
                  onChange={(e) => updateMinConfidence(Number(e.target.value))}
                  className="w-full accent-green-500"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>70% (more permissive)</span>
                  <span>100% (strictest)</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filter Pills */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {f.label}
            {f.count !== undefined && f.count > 0 && (
              <span className={cn(
                "ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                f.id === "CONFLICT"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-purple-500/20 text-purple-400"
              )}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Search className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            {!agenticRagEnabled
              ? "Enable Self-Learning to start"
              : "No research entries yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {!agenticRagEnabled
              ? "Turn on Self-Learning above. When your agent encounters questions it can't answer, it will research them automatically."
              : "When your agent encounters an unanswerable question, research will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "rounded-xl border bg-card p-5 transition-all",
                entry.status === "DRAFT" ? "border-purple-500/20" :
                entry.status === "CONFLICT" ? "border-yellow-500/20" :
                "border-border"
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {entry.status === "DRAFT" && (
                      <span className="flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                        <Sparkles className="h-2.5 w-2.5" />
                        Pending Review
                      </span>
                    )}
                    {entry.status === "APPROVED" && (
                      <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        {entry.reviewedBy === "auto-approve" ? "Auto-Approved" : "Approved"}
                      </span>
                    )}
                    {entry.status === "REJECTED" && (
                      <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                        <XCircle className="h-2.5 w-2.5" />
                        Rejected
                      </span>
                    )}
                    {entry.status === "CONFLICT" && (
                      <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Conflict
                      </span>
                    )}
                    {entry.confidenceScore !== null && (
                      <ConfidenceBadge
                        score={entry.confidenceScore}
                        sourceCount={entry.sourcesDetailed?.length || entry.sources?.length || 0}
                      />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleDateString("de-DE", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{entry.question}</p>
                </div>
              </div>

              {/* Conflict: existing vs new side-by-side */}
              {entry.status === "CONFLICT" && entry.conflictingContent && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Existing KB Entry</p>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {entry.conflictingContent}
                    </p>
                  </div>
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-400">New Research</p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {entry.answer}
                    </p>
                  </div>
                </div>
              )}

              {/* Answer (non-conflict) */}
              {entry.status !== "CONFLICT" && (
                <div className="mt-3 rounded-lg border border-border/60 bg-background/50 p-3">
                  {editingId === entry.id ? (
                    <textarea
                      value={editedAnswer}
                      onChange={(e) => setEditedAnswer(e.target.value)}
                      rows={6}
                      className="w-full bg-transparent text-sm text-foreground leading-relaxed outline-none resize-none placeholder:text-muted-foreground"
                      placeholder="Edit the researched answer..."
                    />
                  ) : (
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {entry.answer}
                    </p>
                  )}
                </div>
              )}

              {/* Sources with trust scores */}
              {entry.sourcesDetailed && entry.sourcesDetailed.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.sourcesDetailed.map((src, i) => (
                    <a
                      key={i}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground hover:border-border"
                    >
                      <TrustBadge score={src.trustScore} />
                      <ExternalLink className="h-2.5 w-2.5" />
                      {src.title || (() => { try { return new URL(src.url).hostname.replace("www.", ""); } catch { return src.url; } })()}
                    </a>
                  ))}
                </div>
              ) : entry.sources && entry.sources.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.sources.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground hover:border-border"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      {(() => { try { return new URL(url).hostname.replace("www.", ""); } catch { return url; } })()}
                    </a>
                  ))}
                </div>
              ) : null}

              {/* Actions — DRAFT */}
              {entry.status === "DRAFT" && (
                <div className="mt-4 flex items-center gap-2">
                  {editingId === entry.id ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleAction(entry.id, "approve", editedAnswer)}
                        disabled={!!actionLoading}
                        className="bg-green-600 hover:bg-green-500 text-white text-xs h-8"
                      >
                        {actionLoading === entry.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Save & Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        className="text-xs h-8"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleAction(entry.id, "approve")}
                        disabled={!!actionLoading}
                        className="bg-green-600 hover:bg-green-500 text-white text-xs h-8"
                      >
                        {actionLoading === entry.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditedAnswer(entry.answer);
                        }}
                        className="text-xs h-8"
                      >
                        <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                        Edit & Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(entry.id, "reject")}
                        disabled={!!actionLoading}
                        className="text-xs h-8 text-red-400 hover:text-red-300 hover:border-red-500/30"
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Actions — CONFLICT */}
              {entry.status === "CONFLICT" && (
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(entry.id, "resolve_conflict", undefined, "keep_existing")}
                    disabled={!!actionLoading}
                    className="text-xs h-8"
                  >
                    Keep Existing
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleAction(entry.id, "resolve_conflict", undefined, "replace")}
                    disabled={!!actionLoading}
                    className="bg-yellow-600 hover:bg-yellow-500 text-white text-xs h-8"
                  >
                    {actionLoading === entry.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Replace with New
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(entry.id, "resolve_conflict", undefined, "keep_both")}
                    disabled={!!actionLoading}
                    className="text-xs h-8 text-green-400 hover:text-green-300 hover:border-green-500/30"
                  >
                    Keep Both
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
