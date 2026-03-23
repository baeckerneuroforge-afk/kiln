"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  X,
  Play,
  SkipForward,
  Square,
  Clock,
  Coins,
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronDown,
  ArrowDown,
  Pause,
  Zap,
  Brain,
  FileText,
  Variable,
  Braces,
  MessageSquare,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DebugStep {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped" | "paused";
  input: Record<string, unknown>;
  config: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  cost: number | null;
  prompt?: {
    system: string;
    user: string;
    fullPrompt: string;
    knowledgeContext: string[];
  };
  contextSnapshot: Record<string, unknown>;
  variablesSnapshot: Record<string, unknown>;
}

interface DebugRunnerProps {
  open: boolean;
  teamId: string;
  executionId: string | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<DebugStep["status"], string> = {
  pending: "bg-zinc-600",
  running: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  skipped: "bg-yellow-500",
  paused: "bg-blue-500",
};

const STATUS_RING: Record<DebugStep["status"], string> = {
  pending: "ring-zinc-600/40",
  running: "ring-blue-500/50 animate-pulse",
  completed: "ring-green-500/40",
  failed: "ring-red-500/40",
  skipped: "ring-yellow-500/40",
  paused: "ring-blue-500/50 animate-pulse",
};

const STATUS_BORDER: Record<DebugStep["status"], string> = {
  pending: "border-zinc-700",
  running: "border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]",
  completed: "border-green-500/60",
  failed: "border-red-500/60",
  skipped: "border-yellow-500/40",
  paused: "border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]",
};

const STATUS_LABELS: Record<DebugStep["status"], string> = {
  pending: "Ausstehend",
  running: "Wird ausgeführt",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
  skipped: "Übersprungen",
  paused: "Pausiert",
};

const NODE_TYPE_ICONS: Record<string, typeof Brain> = {
  agent: Brain,
  condition: Braces,
  action: Zap,
  transform: Variable,
  input: FileText,
  output: FileText,
};

type DetailTab = "detail" | "variables" | "context" | "prompt";

function formatDuration(ms: number | null): string {
  if (ms === null) return "–";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatCost(cost: number | null): string {
  if (cost === null) return "–";
  return `€${cost.toFixed(4)}`;
}

function JsonBlock({ data, label }: { data: unknown; label?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const content = JSON.stringify(data, null, 2);
  const lineCount = content.split("\n").length;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
      {label && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-300 border-b border-zinc-800 transition-colors"
        >
          <span>{label}</span>
          <span className="flex items-center gap-1.5 text-zinc-500">
            <span>{lineCount} Zeilen</span>
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                collapsed && "-rotate-90"
              )}
            />
          </span>
        </button>
      )}
      {!collapsed && (
        <pre className="p-3 text-xs leading-relaxed text-zinc-300 overflow-x-auto font-[var(--font-dm-mono),ui-monospace,monospace] max-h-[320px] overflow-y-auto">
          {content}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Linke Spalte: vereinfachte Node-Liste */
function MiniFlowList({
  steps,
  activeIndex,
  onSelect,
}: {
  steps: DebugStep[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']");
    active?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIndex]);

  return (
    <div
      ref={listRef}
      className="flex flex-col items-center gap-0 py-4 overflow-y-auto flex-1"
    >
      {steps.map((step, i) => {
        const Icon = NODE_TYPE_ICONS[step.nodeType] ?? Circle;
        const isActive = i === activeIndex;

        return (
          <div key={step.nodeId} className="flex flex-col items-center">
            {/* Verbindungspfeil */}
            {i > 0 && (
              <ArrowDown className="h-4 w-4 text-zinc-600 my-1 shrink-0" />
            )}

            {/* Node-Karte */}
            <button
              data-active={isActive}
              onClick={() => onSelect(i)}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all w-full max-w-[200px]",
                isActive
                  ? STATUS_BORDER[step.status]
                  : "border-zinc-800 hover:border-zinc-700"
              )}
            >
              {/* Status-Dot */}
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full shrink-0 ring-2",
                  STATUS_COLORS[step.status],
                  STATUS_RING[step.status]
                )}
              />
              <Icon className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              <span
                className={cn(
                  "text-xs truncate",
                  isActive ? "text-zinc-100 font-medium" : "text-zinc-400"
                )}
              >
                {step.nodeLabel}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Rechte Spalte: Detail-Tabs */
function StepDetailPanel({
  step,
  activeTab,
  onTabChange,
}: {
  step: DebugStep | null;
  activeTab: DetailTab;
  onTabChange: (t: DetailTab) => void;
}) {
  if (!step) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Schritt auswählen, um Details zu sehen.
      </div>
    );
  }

  const tabs: { id: DetailTab; label: string; icon: typeof FileText }[] = [
    { id: "detail", label: "Step Detail", icon: FileText },
    { id: "variables", label: "Variables", icon: Variable },
    { id: "context", label: "Context", icon: Braces },
    ...(step.prompt
      ? [{ id: "prompt" as DetailTab, label: "Prompt", icon: MessageSquare }]
      : []),
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Tab-Leiste */}
      <div className="flex items-center gap-1 border-b border-zinc-800 px-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px",
              activeTab === t.id
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab-Inhalt */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "detail" && <DetailContent step={step} />}
        {activeTab === "variables" && (
          <JsonBlock data={step.variablesSnapshot} label="Workflow-Variablen" />
        )}
        {activeTab === "context" && (
          <JsonBlock data={step.contextSnapshot} label="Execution Context" />
        )}
        {activeTab === "prompt" && step.prompt && (
          <PromptContent prompt={step.prompt} />
        )}
      </div>
    </div>
  );
}

function DetailContent({ step }: { step: DebugStep }) {
  return (
    <>
      {/* Header mit Status */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            {step.nodeLabel}
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Typ: <span className="text-zinc-400">{step.nodeType}</span> · ID:{" "}
            <span className="font-[var(--font-dm-mono),ui-monospace,monospace] text-zinc-400">
              {step.nodeId}
            </span>
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            step.status === "completed" && "bg-green-500/10 text-green-400",
            step.status === "failed" && "bg-red-500/10 text-red-400",
            step.status === "running" && "bg-blue-500/10 text-blue-400",
            step.status === "paused" && "bg-blue-500/10 text-blue-400",
            step.status === "skipped" && "bg-yellow-500/10 text-yellow-400",
            step.status === "pending" && "bg-zinc-500/10 text-zinc-400"
          )}
        >
          {step.status === "running" && (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          {step.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
          {step.status === "failed" && <AlertCircle className="h-3 w-3" />}
          {step.status === "paused" && <Pause className="h-3 w-3" />}
          {STATUS_LABELS[step.status]}
        </span>
      </div>

      {/* Metriken */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          icon={Clock}
          label="Dauer"
          value={formatDuration(step.durationMs)}
        />
        <MetricCard
          icon={Coins}
          label="Kosten"
          value={formatCost(step.cost)}
        />
        <MetricCard
          icon={Zap}
          label="Tokens In"
          value={step.tokensIn !== null ? step.tokensIn.toLocaleString() : "–"}
        />
        <MetricCard
          icon={Zap}
          label="Tokens Out"
          value={
            step.tokensOut !== null ? step.tokensOut.toLocaleString() : "–"
          }
        />
      </div>

      {/* Fehler */}
      {step.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs font-medium text-red-400 mb-1">Fehler</p>
          <pre className="text-xs text-red-300 whitespace-pre-wrap font-[var(--font-dm-mono),ui-monospace,monospace]">
            {step.error}
          </pre>
        </div>
      )}

      {/* Input */}
      <JsonBlock data={step.input} label="Input-Daten" />

      {/* Config */}
      <JsonBlock data={step.config} label="Konfiguration" />

      {/* Output */}
      {step.output !== null && (
        <JsonBlock data={step.output} label="Output-Daten" />
      )}
    </>
  );
}

function PromptContent({
  prompt,
}: {
  prompt: NonNullable<DebugStep["prompt"]>;
}) {
  return (
    <div className="space-y-4">
      {/* System Prompt */}
      <div>
        <h4 className="text-xs font-medium text-zinc-400 mb-2">
          System Prompt
        </h4>
        <pre className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300 whitespace-pre-wrap font-[var(--font-dm-mono),ui-monospace,monospace] max-h-[240px] overflow-y-auto">
          {prompt.system}
        </pre>
      </div>

      {/* Knowledge / RAG Context */}
      {prompt.knowledgeContext.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 mb-2">
            Knowledge Context ({prompt.knowledgeContext.length} Chunks)
          </h4>
          <div className="space-y-2">
            {prompt.knowledgeContext.map((chunk, i) => (
              <pre
                key={i}
                className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-zinc-300 whitespace-pre-wrap font-[var(--font-dm-mono),ui-monospace,monospace] max-h-[160px] overflow-y-auto"
              >
                {chunk}
              </pre>
            ))}
          </div>
        </div>
      )}

      {/* User Prompt */}
      <div>
        <h4 className="text-xs font-medium text-zinc-400 mb-2">
          User Prompt
        </h4>
        <pre className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300 whitespace-pre-wrap font-[var(--font-dm-mono),ui-monospace,monospace] max-h-[240px] overflow-y-auto">
          {prompt.user}
        </pre>
      </div>

      {/* Vollständiger Prompt */}
      <div>
        <h4 className="text-xs font-medium text-zinc-400 mb-2">
          Vollständiger Prompt (wie an LLM gesendet)
        </h4>
        <pre className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-xs text-zinc-300 whitespace-pre-wrap font-[var(--font-dm-mono),ui-monospace,monospace] max-h-[360px] overflow-y-auto">
          {prompt.fullPrompt}
        </pre>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
      <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-sm font-semibold text-zinc-200 font-[var(--font-dm-mono),ui-monospace,monospace]">
        {value}
      </p>
    </div>
  );
}

/** Timeline-Leiste am unteren Rand */
function StepTimeline({
  steps,
  activeIndex,
  onSelect,
}: {
  steps: DebugStep[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const active = scrollRef.current.querySelector("[data-active='true']");
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeIndex]);

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-1 overflow-x-auto px-4 py-2 scrollbar-thin"
    >
      {steps.map((step, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={step.nodeId}
            data-active={isActive}
            onClick={() => onSelect(i)}
            className={cn(
              "group relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs shrink-0 transition-all",
              isActive
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
            title={`${step.nodeLabel} — ${STATUS_LABELS[step.status]}`}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                STATUS_COLORS[step.status],
                step.status === "running" || step.status === "paused"
                  ? "animate-pulse"
                  : ""
              )}
            />
            <span className="truncate max-w-[100px]">{step.nodeLabel}</span>
            {i < steps.length - 1 && (
              <span className="text-zinc-700 ml-1 shrink-0">{">"}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Haupt-Komponente
// ---------------------------------------------------------------------------

export default function DebugRunner({
  open,
  teamId,
  executionId,
  onClose,
}: DebugRunnerProps) {
  const [steps, setSteps] = useState<DebugStep[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<DetailTab>("detail");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Daten laden
  const fetchDebugData = useCallback(async () => {
    if (!executionId || !teamId) return;

    try {
      const res = await fetch(
        `/api/teams/${teamId}/executions/${executionId}/debug`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const newSteps: DebugStep[] = data.steps ?? [];
      setSteps(newSteps);

      // Status ermitteln
      const hasRunning = newSteps.some(
        (s) => s.status === "running" || s.status === "paused"
      );
      const allDone = newSteps.every(
        (s) =>
          s.status === "completed" ||
          s.status === "failed" ||
          s.status === "skipped"
      );
      setIsRunning(hasRunning || (!allDone && newSteps.length > 0));

      // Aktiven Schritt auf den laufenden / pausierten setzen
      const currentIdx = newSteps.findIndex(
        (s) => s.status === "running" || s.status === "paused"
      );
      if (currentIdx !== -1) {
        setActiveIndex(currentIdx);
      }

      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Laden der Debug-Daten"
      );
    }
  }, [teamId, executionId]);

  // Polling
  useEffect(() => {
    if (!open || !executionId) return;

    // Sofort laden
    fetchDebugData();

    pollingRef.current = setInterval(fetchDebugData, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [open, executionId, fetchDebugData]);

  // Polling stoppen wenn nicht mehr am Laufen
  useEffect(() => {
    if (!isRunning && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [isRunning]);

  // Debug-Kontrolle senden
  const sendControl = useCallback(
    async (action: "continue" | "skip" | "abort") => {
      if (!executionId || !teamId) return;
      try {
        await fetch(
          `/api/teams/${teamId}/executions/${executionId}/debug`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          }
        );
        // Nach Aktion sofort neu laden
        fetchDebugData();
      } catch {
        // Fehler ignorieren — nächster Poll holt aktuelle Daten
      }
    },
    [teamId, executionId, fetchDebugData]
  );

  // ESC-Taste
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const activeStep = steps[activeIndex] ?? null;
  const isPaused = activeStep?.status === "paused";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1a1918] text-zinc-100 font-[var(--font-dm-sans),sans-serif]">
      {/* ===== Top-Leiste ===== */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            <h1 className="text-sm font-semibold tracking-tight">
              Debug Runner
            </h1>
          </div>
          {executionId && (
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-[var(--font-dm-mono),ui-monospace,monospace] text-zinc-500">
              {executionId}
            </span>
          )}
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-blue-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Wird ausgeführt
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Kontroll-Buttons */}
          {isPaused && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                onClick={() => sendControl("continue")}
              >
                <Play className="h-3 w-3" />
                Weiter
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
                onClick={() => sendControl("skip")}
              >
                <SkipForward className="h-3 w-3" />
                Überspringen
              </Button>
            </>
          )}
          {isRunning && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => sendControl("abort")}
            >
              <Square className="h-3 w-3" />
              Abbrechen
            </Button>
          )}

          {/* Schließen */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-100"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ===== Fehler-Banner ===== */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-400 shrink-0">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ===== Hauptbereich: Split View ===== */}
      <div className="flex flex-1 overflow-hidden">
        {/* Linke Spalte: Mini Flow */}
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/30">
          <div className="px-3 py-2 border-b border-zinc-800">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Workflow-Schritte
            </h2>
          </div>
          {steps.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
              Warte auf Schritte…
            </div>
          ) : (
            <MiniFlowList
              steps={steps}
              activeIndex={activeIndex}
              onSelect={setActiveIndex}
            />
          )}
        </aside>

        {/* Rechte Spalte: Detail */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <StepDetailPanel
            step={activeStep}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </main>
      </div>

      {/* ===== Bottom: Step-Timeline ===== */}
      {steps.length > 0 && (
        <footer className="border-t border-zinc-800 bg-zinc-900/50 shrink-0">
          <StepTimeline
            steps={steps}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
          />
        </footer>
      )}
    </div>
  );
}
