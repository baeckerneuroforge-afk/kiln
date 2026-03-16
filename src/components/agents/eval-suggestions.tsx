"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FlaskConical,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Pencil,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeGap {
  id: string;
  topic: string;
  questions: { question: string; response: string; conversationId: string; createdAt: string }[];
  count: number;
}

interface FixSuggestion {
  gapId: string;
  type: "knowledge" | "prompt" | "test";
  title: string;
  description: string;
  payload: Record<string, unknown>;
}

interface EvalSuggestionsProps {
  agentId: string;
}

const TYPE_CONFIG = {
  knowledge: {
    icon: BookOpen,
    label: "Knowledge Base",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  prompt: {
    icon: FileText,
    label: "System Prompt",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
  },
  test: {
    icon: FlaskConical,
    label: "Test Case",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
};

export function EvalSuggestions({ agentId }: EvalSuggestionsProps) {
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [suggestions, setSuggestions] = useState<FixSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expandedGap, setExpandedGap] = useState<string | null>(null);
  const [editingPayloads, setEditingPayloads] = useState<Map<string, Record<string, unknown>>>(new Map());

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/eval/suggestions`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGaps(data.gaps || []);
      setSuggestions(data.suggestions || []);
    } catch {
      setGaps([]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  async function applySuggestion(suggestion: FixSuggestion) {
    const key = `${suggestion.gapId}-${suggestion.type}`;
    setApplying(key);

    try {
      const editedPayload = editingPayloads.get(key) || suggestion.payload;
      const res = await fetch(`/api/agents/${agentId}/eval/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: suggestion.type, payload: editedPayload }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to apply suggestion");
      }

      setApplied((prev) => new Set(prev).add(key));
    } catch (err) {
      console.error("Failed to apply suggestion:", err);
    } finally {
      setApplying(null);
    }
  }

  function dismissGap(gapId: string) {
    setDismissed((prev) => new Set(prev).add(gapId));
  }

  function updatePayload(key: string, field: string, value: string) {
    setEditingPayloads((prev) => {
      const next = new Map(prev);
      const existing = next.get(key) || {};
      next.set(key, { ...existing, [field]: value });
      return next;
    });
  }

  // Filtere abgewiesene Gaps
  const visibleGaps = gaps.filter((g) => !dismissed.has(g.id));
  const totalUnanswered = gaps.reduce((sum, g) => sum + g.count, 0);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-kiln-orange/10">
            <Loader2 className="h-5 w-5 animate-spin text-kiln-orange" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Analyzing conversations...</p>
            <p className="text-xs text-muted-foreground">Scanning the last 30 days for knowledge gaps.</p>
          </div>
        </div>
      </div>
    );
  }

  if (visibleGaps.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
          <Check className="h-5 w-5 text-emerald-400" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">No knowledge gaps detected</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {totalUnanswered > 0
            ? "All detected gaps have been dismissed."
            : "Your agent handled all conversations from the last 30 days confidently."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <Lightbulb className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Found {totalUnanswered} unanswered question{totalUnanswered !== 1 ? "s" : ""} in the last 30 days
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Grouped into {visibleGaps.length} topic{visibleGaps.length !== 1 ? "s" : ""}. Review each gap and apply fixes with one click.
            </p>
          </div>
        </div>
      </div>

      {/* Gaps */}
      {visibleGaps.map((gap) => {
        const gapSuggestions = suggestions.filter((s) => s.gapId === gap.id);
        const isExpanded = expandedGap === gap.id;
        const allApplied = gapSuggestions.every((s) => applied.has(`${s.gapId}-${s.type}`));

        return (
          <div
            key={gap.id}
            className={cn(
              "rounded-xl border bg-card transition-colors",
              allApplied ? "border-emerald-500/20 bg-emerald-500/5" : "border-border"
            )}
          >
            {/* Gap Header */}
            <div className="flex items-start gap-3 p-4">
              <button
                onClick={() => setExpandedGap(isExpanded ? null : gap.id)}
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted transition-colors hover:bg-muted/80"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4 shrink-0 text-amber-400" />
                      <p className="truncate text-sm font-medium text-foreground">{gap.topic}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {gap.count} occurrence{gap.count !== 1 ? "s" : ""} — {gap.questions.length} example{gap.questions.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => dismissGap(gap.id)}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
                    title="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Inline-Vorschau: erste Frage */}
                {!isExpanded && (
                  <div className="mt-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">User:</span>{" "}
                      {gap.questions[0].question.slice(0, 120)}{gap.questions[0].question.length > 120 ? "…" : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-border/60 px-4 pb-4 pt-3">
                {/* Example Questions */}
                <div className="mb-4 space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Example questions</p>
                  {gap.questions.map((q, i) => (
                    <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-3">
                      <p className="text-xs text-foreground">{q.question}</p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Agent: {q.response.slice(0, 150)}{q.response.length > 150 ? "…" : ""}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Suggestions */}
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Suggested fixes</p>
                  {gapSuggestions.map((suggestion) => {
                    const key = `${suggestion.gapId}-${suggestion.type}`;
                    const config = TYPE_CONFIG[suggestion.type];
                    const Icon = config.icon;
                    const isApplied = applied.has(key);
                    const isApplying = applying === key;
                    const editedPayload = editingPayloads.get(key);

                    return (
                      <div
                        key={key}
                        className={cn(
                          "rounded-xl border p-3 transition-colors",
                          isApplied ? "border-emerald-500/20 bg-emerald-500/5" : `${config.border} ${config.bg}`
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", config.bg)}>
                              <Icon className={cn("h-3.5 w-3.5", isApplied ? "text-emerald-400" : config.color)} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-foreground">{suggestion.title}</span>
                                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", config.bg, config.color)}>
                                  {config.label}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">{suggestion.description}</p>

                              {/* Editierbare Payload-Felder */}
                              {!isApplied && suggestion.type === "knowledge" && (
                                <div className="mt-2 space-y-1.5">
                                  <div>
                                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Question</label>
                                    <input
                                      type="text"
                                      defaultValue={suggestion.payload.question as string}
                                      onChange={(e) => updatePayload(key, "question", e.target.value)}
                                      className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Answer</label>
                                    <textarea
                                      rows={2}
                                      defaultValue={suggestion.payload.answer as string}
                                      onChange={(e) => updatePayload(key, "answer", e.target.value)}
                                      className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                                    />
                                  </div>
                                </div>
                              )}

                              {!isApplied && suggestion.type === "prompt" && (
                                <div className="mt-2">
                                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Prompt addition</label>
                                  <textarea
                                    rows={2}
                                    defaultValue={suggestion.payload.addition as string}
                                    onChange={(e) => updatePayload(key, "addition", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground font-mono"
                                  />
                                </div>
                              )}

                              {!isApplied && suggestion.type === "test" && (
                                <div className="mt-2 space-y-1.5">
                                  <div>
                                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Test name</label>
                                    <input
                                      type="text"
                                      defaultValue={suggestion.payload.name as string}
                                      onChange={(e) => updatePayload(key, "name", e.target.value)}
                                      className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Expected keywords</label>
                                    <input
                                      type="text"
                                      defaultValue={(editedPayload?.expectedKeywords as string[] || suggestion.payload.expectedKeywords as string[]).join(", ")}
                                      onChange={(e) =>
                                        updatePayload(key, "expectedKeywords", e.target.value)
                                      }
                                      className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                                      placeholder="keyword1, keyword2"
                                    />
                                    <p className="mt-0.5 text-[10px] text-muted-foreground">Comma-separated. All must appear in agent response.</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Apply / Applied Button */}
                          <div className="shrink-0">
                            {isApplied ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-400">
                                <Check className="h-3 w-3" /> Applied
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  // Parse keywords from comma string if test type was edited
                                  if (suggestion.type === "test" && editingPayloads.has(key)) {
                                    const edited = editingPayloads.get(key)!;
                                    if (typeof edited.expectedKeywords === "string") {
                                      edited.expectedKeywords = (edited.expectedKeywords as string)
                                        .split(",")
                                        .map((k: string) => k.trim())
                                        .filter(Boolean);
                                      setEditingPayloads((prev) => {
                                        const next = new Map(prev);
                                        next.set(key, edited);
                                        return next;
                                      });
                                    }
                                  }
                                  applySuggestion(suggestion);
                                }}
                                disabled={isApplying}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-kiln-orange/10 px-3 py-1.5 text-[11px] font-medium text-kiln-orange transition-colors hover:bg-kiln-orange/20 disabled:opacity-50"
                              >
                                {isApplying ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Pencil className="h-3 w-3" />
                                )}
                                Apply
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Re-run hint */}
                {allApplied && (
                  <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-center">
                    <p className="text-xs text-emerald-400">
                      All fixes applied. Re-run your tests in the Testing tab to verify improvement.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
