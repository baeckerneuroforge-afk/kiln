"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Brain,
  Trash2,
  Loader2,
  User,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Memory {
  id: string;
  sessionHash: string;
  key: string;
  value: string;
  updatedAt: string;
  createdAt: string;
}

interface GroupedMemory {
  sessionHash: string;
  memories: Memory[];
}

interface MemoryTabProps {
  agentId: string;
}

export function MemoryTab({ agentId }: MemoryTabProps) {
  const [grouped, setGrouped] = useState<GroupedMemory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/memories`);
      if (res.ok) {
        const data = await res.json();
        setGrouped(data.grouped);
        setTotal(data.total);
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  async function deleteMemory(memoryId: string) {
    setDeleting(memoryId);
    try {
      const res = await fetch(`/api/agents/${agentId}/memories`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId }),
      });
      if (res.ok) {
        // Aus State entfernen
        setGrouped((prev) =>
          prev
            .map((g) => ({
              ...g,
              memories: g.memories.filter((m) => m.id !== memoryId),
            }))
            .filter((g) => g.memories.length > 0)
        );
        setTotal((prev) => prev - 1);
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setDeleting(null);
    }
  }

  function toggleSession(hash: string) {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
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

  if (grouped.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Brain className="h-4 w-4 text-purple-400" />
            Persistent Memory
          </h3>
          <p className="text-xs text-muted-foreground">
            When enabled, the agent remembers key facts about returning visitors across conversations.
            Memories are automatically extracted after each conversation with 3+ messages.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <Brain className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No memories stored yet.</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Memories will appear here after conversations with 3+ messages.
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
            {total} memories across {grouped.length} visitor{grouped.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {grouped.map((group) => {
          const isExpanded = expandedSessions.has(group.sessionHash);
          const nameMemory = group.memories.find((m) => m.key === "name");
          const displayName = nameMemory?.value || `Visitor ${group.sessionHash.slice(0, 8)}`;

          return (
            <div key={group.sessionHash} className="border-b border-border/50 last:border-0">
              <button
                onClick={() => toggleSession(group.sessionHash)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500/10">
                  <User className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-foreground">{displayName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {group.memories.length} memor{group.memories.length !== 1 ? "ies" : "y"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground/50">
                  {group.sessionHash.slice(0, 12)}...
                </span>
              </button>

              {isExpanded && (
                <div className="mx-4 mb-3 space-y-1.5">
                  {group.memories.map((mem) => (
                    <div
                      key={mem.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-background px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                            {mem.key}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            {new Date(mem.updatedAt).toLocaleDateString("en-US", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-foreground">{mem.value}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMemory(mem.id);
                        }}
                        disabled={deleting === mem.id}
                        className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-red-500"
                      >
                        {deleting === mem.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
