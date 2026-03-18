"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Brain,
  Trash2,
  Loader2,
  User,
  ChevronDown,
  ChevronRight,
  Mail,
  Calendar,
  MessageSquare,
  Tag,
  Plus,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface VisitorMemoryContext {
  name?: string;
  interests?: string[];
  questions?: string[];
  objections?: string[];
  buyingStage?: string;
  preferences?: string[];
  keyFacts?: string[];
}

interface VisitorRecord {
  id: string;
  visitorId: string;
  displayName: string | null;
  email: string | null;
  memoryContext: VisitorMemoryContext;
  tags: string[];
  conversationCount: number;
  firstVisitAt: string;
  lastVisitAt: string;
}

interface VisitorMemoryTabProps {
  agentId: string;
}

function daysSince(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

const STAGE_COLORS: Record<string, string> = {
  "browsing": "#3B82F6",
  "evaluating": "#F97316",
  "ready-to-buy": "#22C55E",
  "existing-customer": "#A78BFA",
  "unknown": "#737373",
};

export function VisitorMemoryTab({ agentId }: VisitorMemoryTabProps) {
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<{ id: string; text: string } | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [conversationsFor, setConversationsFor] = useState<string | null>(null);
  const [conversations, setConversations] = useState<{ id: string; createdAt: string; messageCount: number; preview: string }[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);

  const loadVisitors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/visitor-memories`);
      if (res.ok) {
        const data = await res.json();
        setVisitors(data.visitors || []);
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadVisitors();
  }, [loadVisitors]);

  async function deleteVisitor(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/agents/${agentId}/visitor-memories`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorMemoryId: id }),
      });
      if (res.ok) {
        setVisitors((prev) => prev.filter((v) => v.id !== id));
      }
    } catch {
      // noop
    } finally {
      setDeleting(null);
    }
  }

  async function addNote(visitorMemoryId: string, note: string) {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/visitor-memories`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorMemoryId, note }),
      });
      if (res.ok) {
        setNoteInput(null);
        loadVisitors();
      }
    } catch {
      // noop
    } finally {
      setSavingNote(false);
    }
  }

  async function loadConversations(visitorId: string) {
    if (conversationsFor === visitorId) {
      setConversationsFor(null);
      return;
    }
    setConversationsFor(visitorId);
    setLoadingConvs(true);
    try {
      // Conversations für diesen Visitor via sessionId-basierte Suche
      const res = await fetch(`/api/agents/${agentId}/conversations?visitorId=${encodeURIComponent(visitorId)}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      setConversations([]);
    } finally {
      setLoadingConvs(false);
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (visitors.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Brain className="h-4 w-4 text-purple-400" />
            Visitor Memory
          </h3>
          <p className="text-xs text-muted-foreground">
            When enabled, the agent recognizes returning visitors and personalizes conversations
            based on their previous interactions. Memories are automatically extracted after each conversation.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <User className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No visitor profiles yet.</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Visitors will appear here after they interact with your agent via the embed widget.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">
            {visitors.length} recognized visitor{visitors.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {visitors.map((visitor) => {
          const isExpanded = expandedIds.has(visitor.id);
          const ctx = visitor.memoryContext || {};
          const stage = ctx.buyingStage || "unknown";
          const stageColor = STAGE_COLORS[stage] || STAGE_COLORS.unknown;

          return (
            <div key={visitor.id} className="border-b border-border/50 last:border-0">
              {/* Visitor Header */}
              <button
                onClick={() => toggleExpanded(visitor.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/10">
                  <User className="h-4 w-4 text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {visitor.displayName || `Visitor ${visitor.visitorId.slice(0, 12)}`}
                    </span>
                    {visitor.email && (
                      <span className="flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                        <Mail className="h-2.5 w-2.5" />
                        {visitor.email}
                      </span>
                    )}
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: `${stageColor}15`, color: stageColor }}
                    >
                      {stage}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-2.5 w-2.5" />
                      {visitor.conversationCount} conversation{visitor.conversationCount !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5" />
                      Last visit: {daysSince(visitor.lastVisitAt)}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="mx-4 mb-3 space-y-3">
                  {/* Memory Context */}
                  <div className="rounded-lg border border-border/50 bg-background p-3 space-y-2">
                    {ctx.interests && ctx.interests.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Interests</span>
                        <p className="mt-0.5 text-xs text-foreground">{ctx.interests.join(", ")}</p>
                      </div>
                    )}
                    {ctx.questions && ctx.questions.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Questions asked</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {ctx.questions.map((q, i) => (
                            <li key={i} className="text-xs text-foreground">&bull; {q}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {ctx.objections && ctx.objections.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Objections</span>
                        <p className="mt-0.5 text-xs text-foreground">{ctx.objections.join(", ")}</p>
                      </div>
                    )}
                    {ctx.keyFacts && ctx.keyFacts.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Key facts</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {ctx.keyFacts.map((f, i) => (
                            <li key={i} className="text-xs text-foreground">&bull; {f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {ctx.preferences && ctx.preferences.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Preferences</span>
                        <p className="mt-0.5 text-xs text-foreground">{ctx.preferences.join(", ")}</p>
                      </div>
                    )}
                    {!ctx.interests?.length && !ctx.questions?.length && !ctx.keyFacts?.length && (
                      <p className="text-xs text-muted-foreground italic">No memory context extracted yet.</p>
                    )}
                  </div>

                  {/* Tags */}
                  {visitor.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {visitor.tags.map((tag) => (
                        <span
                          key={tag}
                          className="flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-400"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Add Note */}
                    {noteInput?.id === visitor.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="text"
                          value={noteInput.text}
                          onChange={(e) => setNoteInput({ ...noteInput, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && noteInput.text.trim()) {
                              addNote(visitor.id, noteInput.text.trim());
                            }
                            if (e.key === "Escape") setNoteInput(null);
                          }}
                          placeholder="Add a note about this visitor..."
                          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={() => noteInput.text.trim() && addNote(visitor.id, noteInput.text.trim())}
                          disabled={!noteInput.text.trim() || savingNote}
                          className="h-7 bg-purple-500 px-3 text-xs hover:bg-purple-600"
                        >
                          {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setNoteInput({ id: visitor.id, text: "" })}
                        className="h-7 gap-1 text-xs"
                      >
                        <Plus className="h-3 w-3" />
                        Add note
                      </Button>
                    )}

                    {/* View Conversations */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loadConversations(visitor.visitorId)}
                      className="h-7 gap-1 text-xs"
                    >
                      <Eye className="h-3 w-3" />
                      {conversationsFor === visitor.visitorId ? "Hide" : "Conversations"}
                    </Button>

                    {/* Delete */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteVisitor(visitor.id)}
                      disabled={deleting === visitor.id}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                    >
                      {deleting === visitor.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>

                  {/* Conversation History */}
                  {conversationsFor === visitor.visitorId && (
                    <div className="rounded-lg border border-border/50 bg-background p-3">
                      {loadingConvs ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : conversations.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No conversation history found.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {conversations.map((conv) => (
                            <div
                              key={conv.id}
                              className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-foreground">{conv.preview || "No messages"}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(conv.createdAt).toLocaleDateString("en-US", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })} &middot; {conv.messageCount} messages
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
