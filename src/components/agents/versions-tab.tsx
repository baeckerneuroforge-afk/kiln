"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  MessageSquarePlus,
  Check,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfigSnapshot {
  name?: string;
  systemPrompt?: string;
  personality?: Record<string, string> | null;
  welcomeMessage?: string | null;
  suggestedQuestions?: string[];
  llmModel?: string;
  status?: string;
  whiteLabel?: Record<string, unknown> | null;
  showPoweredBy?: boolean;
  memoryEnabled?: boolean;
  imageAnalysisEnabled?: boolean;
  actions?: { type: string; enabled: boolean; config: unknown }[];
}

interface AgentVersion {
  id: string;
  versionNumber: number;
  configSnapshot: ConfigSnapshot;
  note: string | null;
  createdAt: string;
}

// Felder die wir im Diff anzeigen, mit lesbaren Labels
const DIFF_FIELDS: { key: keyof ConfigSnapshot; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "systemPrompt", label: "System Prompt" },
  { key: "welcomeMessage", label: "Welcome Message" },
  { key: "suggestedQuestions", label: "Suggested Questions" },
  { key: "llmModel", label: "Model" },
  { key: "status", label: "Status" },
  { key: "personality", label: "Personality" },
  { key: "whiteLabel", label: "White-Label" },
  { key: "showPoweredBy", label: "Show Powered By" },
  { key: "memoryEnabled", label: "Memory" },
  { key: "imageAnalysisEnabled", label: "Image Analysis" },
  { key: "actions", label: "Actions" },
];

function serialize(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  return JSON.stringify(val, null, 2);
}

// Berechnet welche Felder sich zwischen zwei Versionen geändert haben
function computeChanges(
  prev: ConfigSnapshot | null,
  curr: ConfigSnapshot
): { key: string; label: string; oldVal: string; newVal: string }[] {
  const changes: { key: string; label: string; oldVal: string; newVal: string }[] = [];

  for (const { key, label } of DIFF_FIELDS) {
    const oldStr = prev ? serialize(prev[key]) : "";
    const newStr = serialize(curr[key]);
    if (oldStr !== newStr) {
      changes.push({ key, label, oldVal: oldStr, newVal: newStr });
    }
  }

  return changes;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Kürzt lange Strings für die Diff-Anzeige
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "…";
}

interface Props {
  agentId: string;
  onRestore?: () => void;
}

export function VersionsTab({ agentId, onRestore }: Props) {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AgentVersion | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    fetchVersions();
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchVersions() {
    try {
      const res = await fetch(`/api/agents/${agentId}/versions`);
      if (res.ok) {
        setVersions(await res.json());
      }
    } catch {
      // Fehler
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(version: AgentVersion) {
    setRestoring(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id, action: "restore" }),
      });
      if (res.ok) {
        setRestoreTarget(null);
        await fetchVersions();
        onRestore?.();
      }
    } catch {
      // Fehler
    } finally {
      setRestoring(false);
    }
  }

  async function handleSaveNote(versionId: string) {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, action: "annotate", note: noteText.trim() || null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setVersions((prev) =>
          prev.map((v) => (v.id === versionId ? { ...v, note: updated.note } : v))
        );
        setEditingNoteId(null);
      }
    } catch {
      // Fehler
    } finally {
      setSavingNote(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Version History</h2>
        <p className="text-sm text-muted-foreground">
          Every save creates a new version. Restore any previous configuration.
        </p>
      </div>

      {versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <History className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No versions yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Versions are created automatically when you save the agent.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((version, index) => {
            const isLatest = index === 0;
            const prevVersion = index < versions.length - 1 ? versions[index + 1] : null;
            const changes = computeChanges(
              prevVersion?.configSnapshot ?? null,
              version.configSnapshot
            );
            const isExpanded = expandedId === version.id;

            return (
              <div
                key={version.id}
                className={cn(
                  "rounded-xl border bg-card/50 overflow-hidden",
                  isLatest ? "border-green-500/30" : "border-border"
                )}
              >
                {/* Hauptzeile */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Version-Nummer */}
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                      isLatest
                        ? "bg-green-500/10 text-green-400"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    v{version.versionNumber}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        Version {version.versionNumber}
                      </p>
                      {isLatest && (
                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                          Current
                        </span>
                      )}
                      {version.note && !isLatest && (
                        <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground max-w-[200px]">
                          {version.note}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(version.createdAt)}</span>
                      {changes.length > 0 && (
                        <span className="text-kiln-orange">
                          {changes.length} field{changes.length !== 1 ? "s" : ""} changed
                        </span>
                      )}
                      {changes.length === 0 && prevVersion && (
                        <span>No changes</span>
                      )}
                    </div>
                  </div>

                  {/* Note-Button */}
                  <button
                    onClick={() => {
                      setEditingNoteId(editingNoteId === version.id ? null : version.id);
                      setNoteText(version.note || "");
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Add note"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                  </button>

                  {/* Expand */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : version.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  {/* Restore */}
                  {!isLatest && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRestoreTarget(version)}
                      className="text-xs"
                    >
                      <RotateCcw className="mr-1.5 h-3 w-3" />
                      Restore
                    </Button>
                  )}
                </div>

                {/* Note Editor */}
                {editingNoteId === version.id && (
                  <div className="border-t border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="e.g. Fixed pricing response"
                        className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveNote(version.id);
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveNote(version.id)}
                        disabled={savingNote}
                      >
                        {savingNote ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Expanded Diff View */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-2">
                    {version.note && (
                      <p className="text-xs italic text-muted-foreground mb-3">
                        &quot;{version.note}&quot;
                      </p>
                    )}
                    {changes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {prevVersion ? "No changes from previous version." : "Initial version."}
                      </p>
                    ) : (
                      changes.map((change) => (
                        <div key={change.key} className="rounded-lg border border-border overflow-hidden">
                          <div className="bg-muted/50 px-3 py-1.5">
                            <p className="text-xs font-semibold text-foreground">
                              {change.label}
                            </p>
                          </div>
                          <div className="divide-y divide-border">
                            {change.oldVal && (
                              <div className="px-3 py-2 bg-red-500/5">
                                <pre className="text-[11px] text-red-400 whitespace-pre-wrap font-mono leading-relaxed">
                                  - {truncate(change.oldVal, 500)}
                                </pre>
                              </div>
                            )}
                            {change.newVal && (
                              <div className="px-3 py-2 bg-green-500/5">
                                <pre className="text-[11px] text-green-400 whitespace-pre-wrap font-mono leading-relaxed">
                                  + {truncate(change.newVal, 500)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setRestoreTarget(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-[#1C1917] p-6 shadow-2xl mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Restore Version {restoreTarget.versionNumber}?
            </h3>
            <p className="text-sm text-muted-foreground mb-1">
              This will replace the current config with version {restoreTarget.versionNumber}.
            </p>
            <p className="text-xs text-muted-foreground mb-5">
              The current config will be auto-saved as a new version before restoring.
            </p>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRestoreTarget(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleRestore(restoreTarget)}
                disabled={restoring}
                className="bg-kiln-orange hover:bg-kiln-orange/90"
              >
                {restoring ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Restore
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
