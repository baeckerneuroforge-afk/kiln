"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Zap, Send, Loader2, ChevronRight, CheckCircle2,
  AlertTriangle, Coins, ArrowRight, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  data?: {
    type: "analysis" | "preview" | "questions" | "built";
    components?: string[];
    questions?: string[];
    needsMoreInfo?: boolean;
    workflow?: WorkflowPreview;
  };
}

interface WorkflowPreview {
  workflowId: string;
  name: string;
  description: string;
  nodes: Array<{ id: string; type: string; label: string; position: { x: number; y: number } }>;
  edges: Array<{ id: string; source: string; target: string }>;
  estimatedCreditsPerRun: number;
  trigger: { type: string; config: Record<string, unknown> };
  credentialsNeeded: string[];
  reasoning: string;
  status: string;
}

interface AutoBuildChatProps {
  onWorkflowCreated?: (workflowId: string) => void;
  className?: string;
}

/* ── Node Icons ── */

const NODE_COLORS: Record<string, string> = {
  trigger_manual: "bg-zinc-500/10 text-zinc-400",
  trigger_schedule: "bg-blue-500/10 text-blue-400",
  trigger_webhook: "bg-violet-500/10 text-violet-400",
  computer_use: "bg-pink-500/10 text-pink-400",
  code_sandbox: "bg-emerald-500/10 text-emerald-400",
  ai_agent: "bg-orange-500/10 text-orange-400",
  gmail_send: "bg-red-500/10 text-red-400",
  slack_send_integration: "bg-purple-500/10 text-purple-400",
  http_request: "bg-cyan-500/10 text-cyan-400",
  condition: "bg-amber-500/10 text-amber-400",
  merge: "bg-teal-500/10 text-teal-400",
  transform: "bg-indigo-500/10 text-indigo-400",
};

/* ── Component ── */

export function AutoBuildChat({ onWorkflowCreated, className }: AutoBuildChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Beschreibe, was dein Workflow tun soll. Ich erstelle ihn für dich — komplett konfiguriert und einsatzbereit.\n\nBeispiele:\n- \"Jeden Montag Preise von 3 Konkurrenten vergleichen und per E-Mail senden\"\n- \"Wenn ein neuer Lead in HubSpot eingeht, recherchiere die Firma und bewerte den Lead\"\n- \"Täglich um 9 Uhr News aus Reddit und Hacker News zusammenfassen\"",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [builtWorkflow, setBuiltWorkflow] = useState<WorkflowPreview | null>(null);
  const [activating, setActivating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (role: "user" | "assistant", content: string, data?: ChatMessage["data"]) => {
    setMessages((prev) => [...prev, {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
      timestamp: new Date(),
      data,
    }]);
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    addMessage("user", userMessage);
    setLoading(true);

    try {
      // Erst analysieren ob wir genug Info haben
      const analyzeRes = await fetch("/api/workflows/auto-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: userMessage,
          action: "analyze",
        }),
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        addMessage("assistant", err.error || "Fehler bei der Analyse.");
        return;
      }

      const analysis = await analyzeRes.json() as {
        components: string[];
        questions: string[];
        needsMoreInfo: boolean;
      };

      if (analysis.needsMoreInfo && analysis.questions.length > 0) {
        // Follow-up-Fragen stellen
        const questionsText = analysis.questions.map((q: string) => `- ${q}`).join("\n");
        addMessage("assistant",
          `Ich verstehe grob was du willst. Bevor ich den Workflow baue, brauche ich noch ein paar Details:\n\n${questionsText}`,
          { type: "questions", questions: analysis.questions, needsMoreInfo: true },
        );
        return;
      }

      // Genug Info — Workflow bauen
      addMessage("assistant", "Perfekt, ich baue den Workflow...");

      // Alle bisherigen User-Nachrichten als Kontext sammeln
      const allUserMessages = [...messages.filter((m) => m.role === "user").map((m) => m.content), userMessage];
      const fullDescription = allUserMessages.join("\n\nWeitere Details: ");

      const buildRes = await fetch("/api/workflows/auto-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: fullDescription,
          action: "build",
        }),
      });

      if (!buildRes.ok) {
        const err = await buildRes.json();
        addMessage("assistant", `Fehler: ${err.error || "Workflow konnte nicht erstellt werden."}`);
        return;
      }

      const result = await buildRes.json() as {
        workflowId: string;
        preview: WorkflowPreview & { name: string; description: string; nodes: WorkflowPreview["nodes"]; edges: WorkflowPreview["edges"]; estimatedCreditsPerRun: number; trigger: WorkflowPreview["trigger"]; reasoning: string };
        credentialsNeeded: string[];
        estimatedCreditsPerRun: number;
        status: string;
      };

      const workflow: WorkflowPreview = {
        workflowId: result.workflowId,
        name: result.preview.name,
        description: result.preview.description,
        nodes: result.preview.nodes,
        edges: result.preview.edges,
        estimatedCreditsPerRun: result.estimatedCreditsPerRun,
        trigger: result.preview.trigger,
        credentialsNeeded: result.credentialsNeeded,
        reasoning: result.preview.reasoning,
        status: result.status,
      };

      setBuiltWorkflow(workflow);
      addMessage("assistant",
        `Workflow „${workflow.name}" wurde erstellt!`,
        { type: "built", workflow },
      );
    } catch {
      addMessage("assistant", "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleActivate = async () => {
    if (!builtWorkflow) return;
    setActivating(true);

    try {
      const res = await fetch(`/api/workflows/auto-build/${builtWorkflow.workflowId}/activate`, {
        method: "POST",
      });

      if (res.ok) {
        addMessage("assistant", "Workflow ist jetzt aktiv! Er wird gemäß dem Trigger automatisch ausgeführt.");
        onWorkflowCreated?.(builtWorkflow.workflowId);
      } else {
        addMessage("assistant", "Aktivierung fehlgeschlagen.");
      }
    } catch {
      addMessage("assistant", "Fehler bei der Aktivierung.");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2a2a3a]">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
          <Sparkles className="h-4.5 w-4.5 text-orange-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Build with AI</h2>
          <p className="text-[10px] text-zinc-600">Beschreibe deinen Workflow — ich baue ihn für dich</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3",
              msg.role === "user"
                ? "bg-orange-600 text-white"
                : "bg-[#1a1a24] border border-[#2a2a3a] text-zinc-300"
            )}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

              {/* Workflow Preview */}
              {msg.data?.type === "built" && msg.data.workflow && (
                <div className="mt-4 space-y-3">
                  {/* Mini Node Graph */}
                  <div className="rounded-xl border border-[#2a2a3a] bg-[#0c0a09] p-4">
                    <div className="flex flex-wrap gap-2">
                      {msg.data.workflow.nodes.map((node, i) => (
                        <div key={node.id} className="flex items-center gap-1.5">
                          <div className={cn(
                            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5",
                            NODE_COLORS[node.type] || "bg-zinc-500/10 text-zinc-400"
                          )}>
                            <span className="text-[10px] font-medium">{node.label}</span>
                          </div>
                          {i < msg.data!.workflow!.nodes.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-zinc-700" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Meta-Info */}
                  <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Coins className="h-3 w-3 text-orange-400" />
                      ~{msg.data.workflow.estimatedCreditsPerRun} Credits/Lauf
                    </span>
                    <span>
                      {msg.data.workflow.trigger.type === "schedule" ? "Zeitplan" : "Manuell"}
                    </span>
                    <span>{msg.data.workflow.nodes.length} Nodes</span>
                  </div>

                  {/* Credentials Warning */}
                  {msg.data.workflow.credentialsNeeded.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                      <div className="text-[10px] text-amber-400/80">
                        <p className="font-medium">Credentials benötigt:</p>
                        {msg.data.workflow.credentialsNeeded.map((c, ci) => (
                          <p key={ci}>- {c}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reasoning */}
                  {msg.data.workflow.reasoning && (
                    <p className="text-[10px] text-zinc-600 italic">{msg.data.workflow.reasoning}</p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleActivate}
                      disabled={activating}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
                    >
                      {activating ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="mr-1 h-3 w-3" />
                      )}
                      Build & Activate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onWorkflowCreated?.(msg.data!.workflow!.workflowId)}
                      className="text-xs h-8 border-[#2a2a3a] text-zinc-400"
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Als Draft speichern
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#1a1a24] border border-[#2a2a3a] rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-orange-400 animate-spin" />
              <span className="text-sm text-zinc-500">Denke nach...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-[#2a2a3a]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Beschreibe deinen Workflow..."
            disabled={loading}
            className="flex-1 bg-[#141418] border border-[#2a2a3a] rounded-xl text-sm text-zinc-100 px-4 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-700 disabled:opacity-50"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-orange-600 hover:bg-orange-500 text-white h-10 w-10 p-0 rounded-xl"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-700">
          <span className="flex items-center gap-1">
            <ChevronRight className="h-2.5 w-2.5" />
            Tipp: Je detaillierter, desto besser
          </span>
        </div>
      </div>
    </div>
  );
}
