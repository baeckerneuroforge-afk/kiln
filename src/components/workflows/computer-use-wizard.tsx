"use client";

import { useState, useCallback } from "react";
import {
  Wand2, Loader2, ArrowRight, Monitor, Terminal, Clock,
  Mail, MessageSquare, Globe, Check, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WizardOutput, SuggestedNode } from "@/lib/sandbox/computer-use-wizard";

interface ComputerUseWizardProps {
  teamId: string;
  onCreateWorkflow?: (nodes: SuggestedNode[]) => void;
  onClose?: () => void;
}

export function ComputerUseWizard({ teamId, onCreateWorkflow, onClose }: ComputerUseWizardProps) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WizardOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // teamId für zukünftige API-Aufrufe
  void teamId;

  const analyze = useCallback(async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/workflows/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      if (!res.ok) {
        throw new Error("Analyse fehlgeschlagen");
      }

      const data = await res.json() as WizardOutput;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [description]);

  const handleCreate = () => {
    if (result?.suggestedNodes && onCreateWorkflow) {
      onCreateWorkflow(result.suggestedNodes);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
            <Wand2 className="h-4.5 w-4.5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Quick Setup</h3>
            <p className="text-[10px] text-muted-foreground">Beschreibe was dein Agent tun soll</p>
          </div>
        </div>
        {onClose && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Schließen
          </Button>
        )}
      </div>

      {/* Input */}
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="z.B. &quot;Überprüfe jeden Montag die Preise auf competitor.com und schicke mir eine E-Mail mit den Änderungen&quot;"
            rows={3}
            className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-muted-foreground resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                analyze();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">⌘ + Enter zum Analysieren</p>
            <Button
              size="sm"
              onClick={analyze}
              disabled={loading || !description.trim()}
              className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8"
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Analysieren
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-950/20 px-3 py-2 text-[11px] text-red-400">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4">
            {/* Task Summary */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h4 className="text-xs font-semibold text-foreground">Was KILN einrichten wird:</h4>

              {/* Task */}
              <div className="flex items-start gap-2">
                <Monitor className="h-3.5 w-3.5 text-pink-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-foreground">{result.task}</p>
              </div>

              {/* URLs */}
              {result.urls.length > 0 && (
                <div className="flex items-start gap-2">
                  <Globe className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    {result.urls.map((url, i) => (
                      <div key={i} className="font-mono">{url}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Schedule */}
              {result.schedule && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                  <span className="text-[11px] text-muted-foreground font-mono">{result.schedule}</span>
                </div>
              )}

              {/* Features */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {result.enableCodeExecution && (
                  <FeatureBadge icon={Terminal} label="Code Sandbox" color="text-green-400" />
                )}
                {result.enableVerification && (
                  <FeatureBadge icon={Check} label="Verifikation" color="text-blue-400" />
                )}
                {result.enableProceduralMemory && (
                  <FeatureBadge icon={RefreshCw} label="Prozedurales Lernen" color="text-purple-400" />
                )}
                {result.notifyVia === "email" && (
                  <FeatureBadge icon={Mail} label="E-Mail" color="text-orange-400" />
                )}
                {result.notifyVia === "slack" && (
                  <FeatureBadge icon={MessageSquare} label="Slack" color="text-cyan-400" />
                )}
              </div>
            </div>

            {/* Workflow Preview */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="text-xs font-semibold text-foreground mb-3">Workflow-Vorschau</h4>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {result.suggestedNodes.map((node, i) => (
                  <div key={i} className="flex items-center gap-2 shrink-0">
                    {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase block">
                        {node.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] text-foreground">{node.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reasoning */}
            {result.reasoning && (
              <p className="text-[10px] text-muted-foreground italic">{result.reasoning}</p>
            )}

            {/* Create Button */}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setResult(null)}
                className="text-muted-foreground hover:text-foreground text-xs h-8"
              >
                Nochmal
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8"
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Workflow erstellen
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FeatureBadge({
  icon: Icon,
  label,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
}) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium border border-current/10",
      color,
    )}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
