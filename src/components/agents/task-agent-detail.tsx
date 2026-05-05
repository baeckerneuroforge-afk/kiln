"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ArrowLeft,
  Zap,
  Save,
  Loader2,
  Download,
  Clock,
  Hand,
  Webhook,
  Mail,
  ArrowRight,
  Code2,
  Link2,
  CircleStop,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  BookOpen,
  Settings2,
  Play,
  Brain,
  Shield,
  FlaskConical,
  RefreshCw,
  Filter,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PROVIDERS, getModelsForProvider, getModelDef, type ProviderKey } from "@/lib/ai";
import { getCreditCost } from "@/lib/credits";
import { useToast } from "@/components/toast";
import {
  PreProcessBlock,
  PostProcessBlock,
  type PreProcessConfig,
  type PostProcessConfig,
} from "@/components/agents/logic-block-editor";
import { IoSchemaEditor } from "@/components/agents/io-schema-editor";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  systemPrompt: string;
  personality: { tone?: string; language?: string; formality?: string } | null;
  welcomeMessage: string | null;
  suggestedQuestions: string[];
  llmModel: string;
  modelProvider: string;
  status: "DRAFT" | "LIVE" | "PAUSED";
  whiteLabel: Record<string, unknown> | null;
  showPoweredBy: boolean;
  memoryEnabled: boolean;
  imageAnalysisEnabled: boolean;
  showAiDisclaimer: boolean;
  customDomain: string | null;
  promptBranches: { name: string; keywords: string[]; promptSnippet: string; enabled: boolean }[] | null;
  visibility: "PUBLIC" | "INTERNAL";
  mode: "CHAT" | "TASK";
  triggerType?: "MANUAL" | "SCHEDULE" | "WEBHOOK" | "EVENT";
  outputType?: "NONE" | "HTTP_REQUEST" | "EMAIL" | "NEXT_AGENT" | "WEBHOOK" | "CUSTOM_CODE";
  triggerConfig?: Record<string, unknown> | null;
  preProcessConfig?: PreProcessConfig | null;
  postProcessConfig?: PostProcessConfig | null;
  outputConfig?: Record<string, unknown> | null;
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  strictOutputValidation?: boolean;
  lastRunAt?: string | null;
  lastRunResult?: Record<string, unknown> | null;
  clonedFromId: string | null;
  clonedFromName: string | null;
  createdAt: string;
  actions: { id: string; type: string; enabled: boolean; config: Record<string, string> | null }[];
  knowledgeBases: { id: string; type: string; sourceName: string; embeddingStatus: string; chunkCount: number; createdAt: string }[];
  _count: { conversations: number };
}

interface Run {
  id: string;
  triggerType: string;
  input: Record<string, unknown> | string | null;
  output: string | null;
  outputAction: Record<string, unknown> | null;
  status: string;
  error: string | null;
  duration: number | null;
  creditsUsed: number;
  createdAt: string;
}

const triggerIcons: Record<string, React.ElementType> = {
  MANUAL: Hand,
  SCHEDULE: Clock,
  WEBHOOK: Webhook,
  EVENT: Zap,
};

const triggerLabels: Record<string, string> = {
  MANUAL: "Manual",
  SCHEDULE: "Schedule",
  WEBHOOK: "Webhook",
  EVENT: "Event",
};

const outputIcons: Record<string, React.ElementType> = {
  NONE: CircleStop,
  HTTP_REQUEST: ArrowRight,
  EMAIL: Mail,
  NEXT_AGENT: Link2,
  WEBHOOK: Webhook,
  CUSTOM_CODE: Code2,
};

const outputLabels: Record<string, string> = {
  NONE: "None",
  HTTP_REQUEST: "HTTP Request",
  EMAIL: "Email",
  NEXT_AGENT: "Next Agent",
  WEBHOOK: "Webhook",
  CUSTOM_CODE: "Custom Code",
};

const statusConfig = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  LIVE: { label: "Live", className: "bg-kiln-green/10 text-kiln-green" },
  PAUSED: { label: "Paused", className: "bg-kiln-orange/10 text-kiln-orange" },
};

/* ─── Pipeline Arrow Connector ─── */
function PipelineArrow() {
  return (
    <div className="hidden lg:flex items-center justify-center w-16 shrink-0">
      <svg width="64" height="24" viewBox="0 0 64 24" fill="none" className="text-muted-foreground">
        <line x1="0" y1="12" x2="52" y2="12" stroke="currentColor" strokeWidth="1.5" className="pipeline-arrow" />
        <polygon points="52,6 64,12 52,18" fill="currentColor" opacity="0.6" />
        <circle r="3" fill="#F97316" opacity="0.8">
          <animateMotion dur="1.5s" repeatCount="indefinite" path="M 0,12 L 52,12" />
        </circle>
      </svg>
    </div>
  );
}

/* ─── Down Arrow for mobile ─── */
function PipelineArrowDown() {
  return (
    <div className="flex lg:hidden items-center justify-center h-10">
      <svg width="24" height="40" viewBox="0 0 24 40" fill="none" className="text-muted-foreground">
        <line x1="12" y1="0" x2="12" y2="28" stroke="currentColor" strokeWidth="1.5" className="pipeline-arrow" />
        <polygon points="6,28 12,40 18,28" fill="currentColor" opacity="0.6" />
      </svg>
    </div>
  );
}

export function TaskAgentDetail({ agent: initialAgent }: { agent: Agent }) {

  const { toast } = useToast();

  // Agent state
  const [agent, setAgent] = useState(initialAgent);
  const [name, setName] = useState(initialAgent.name);
  const [systemPrompt, setSystemPrompt] = useState(initialAgent.systemPrompt);
  const [status, setStatus] = useState(initialAgent.status);
  const [llmModel, setLlmModel] = useState(initialAgent.llmModel || "claude-sonnet-4-6");
  const [modelProvider, setModelProvider] = useState(initialAgent.modelProvider || "ANTHROPIC");
  const [triggerType, setTriggerType] = useState(initialAgent.triggerType || "MANUAL");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    (initialAgent.triggerConfig as Record<string, unknown>) || {}
  );
  const [outputType, setOutputType] = useState(initialAgent.outputType || "NONE");
  const [preProcessConfig, setPreProcessConfig] = useState<PreProcessConfig>(
    (initialAgent.preProcessConfig as PreProcessConfig) || { enabled: false, code: "", conditions: [] }
  );
  const [postProcessConfig, setPostProcessConfig] = useState<PostProcessConfig>(
    (initialAgent.postProcessConfig as PostProcessConfig) || { enabled: false, code: "", conditions: [], branches: [] }
  );
  const [outputConfig, setOutputConfig] = useState<Record<string, unknown>>(
    (initialAgent.outputConfig as Record<string, unknown>) || {}
  );
  const [memoryEnabled, setMemoryEnabled] = useState(initialAgent.memoryEnabled);
  const [showAiDisclaimer, setShowAiDisclaimer] = useState(initialAgent.showAiDisclaimer !== false);
  const [inputSchema, setInputSchema] = useState<Record<string, unknown> | null>(
    initialAgent.inputSchema ?? null
  );
  const [outputSchema, setOutputSchema] = useState<Record<string, unknown> | null>(
    initialAgent.outputSchema ?? null
  );
  const [strictOutputValidation, setStrictOutputValidation] = useState(
    initialAgent.strictOutputValidation === true
  );
  const [saving, setSaving] = useState(false);

  // Runs state
  const [runs, setRuns] = useState<Run[]>([]);
  const [runsOpen, setRunsOpen] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runningTask, setRunningTask] = useState(false);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);

  // Collapsible sections in Process block
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  // Webhook URL
  const [webhookCopied, setWebhookCopied] = useState(false);

  // Agents list for "Next Agent" output
  const [allAgents, setAllAgents] = useState<{ id: string; name: string }[]>([]);

  // Load runs
  const loadRuns = useCallback(() => {
    fetch(`/api/agents/${agent.id}/run`)
      .then((r) => r.json())
      .then((d) => setRuns(d.runs || []))
      .catch(() => {});
  }, [agent.id]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  // Load agents for Next Agent dropdown
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAllAgents(data.filter((a: { id: string }) => a.id !== agent.id).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
      })
      .catch(() => {});
  }, [agent.id]);

  // Save handler
  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          systemPrompt,
          status,
          llmModel,
          modelProvider,
          triggerType,
          triggerConfig: Object.keys(triggerConfig).length > 0 ? triggerConfig : undefined,
          preProcessConfig: preProcessConfig.enabled ? preProcessConfig : null,
          postProcessConfig: postProcessConfig.enabled ? postProcessConfig : null,
          outputType,
          outputConfig: Object.keys(outputConfig).length > 0 ? outputConfig : undefined,
          memoryEnabled,
          showAiDisclaimer,
          inputSchema,
          outputSchema,
          strictOutputValidation,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAgent({ ...agent, ...updated });
        toast("Agent saved");
      } else {
        toast("Failed to save", "error");
      }
    } catch {
      toast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  // Run Now handler
  async function handleRunNow() {
    setRunningTask(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "Run your configured task." }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`Run completed: ${data.status}`, "success");
        loadRuns();
      } else {
        toast(data.error || "Run failed", "error");
      }
    } catch {
      toast("Run failed", "error");
    } finally {
      setRunningTask(false);
    }
  }

  // Test Run handler
  async function handleTestRun() {
    setTestRunning(true);
    setTestOutput(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: testInput || "Run your configured task." }),
      });
      const data = await res.json();
      setTestOutput(res.ok ? data.output : data.error || "Run failed");
      if (res.ok) loadRuns();
    } catch {
      setTestOutput("Run failed");
    } finally {
      setTestRunning(false);
    }
  }

  // Export config
  function handleExport() {
    const exportData = {
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      llmModel: agent.llmModel,
      triggerType,
      triggerConfig,
      outputType,
      outputConfig,
      actions: agent.actions,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.slug}-config.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Config exported", "success");
  }

  const TriggerIcon = triggerIcons[triggerType] || Hand;
  const OutputIcon = outputIcons[outputType] || CircleStop;
  const modelDef = getModelDef(llmModel);
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/agent/${agent.slug}` : "";

  return (
    <div className="mx-auto max-w-7xl">
      {/* ── Top Header ── */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/agents">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-kiln-orange/10">
            <Zap className="h-5 w-5 text-kiln-orange" />
          </div>
          <div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-transparent text-xl font-bold text-foreground focus:outline-none border-b border-transparent focus:border-kiln-orange/50 transition-colors"
            />
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", statusConfig[status].className)}>
                {statusConfig[status].label}
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "DRAFT" | "LIVE" | "PAUSED")}
                className="bg-transparent text-[10px] text-muted-foreground border-none focus:outline-none cursor-pointer"
              >
                <option value="DRAFT">Draft</option>
                <option value="LIVE">Live</option>
                <option value="PAUSED">Paused</option>
              </select>
              {modelDef && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
                  {modelDef.shortLabel}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={runningTask}
            onClick={handleRunNow}
            className="border-kiln-orange/30 text-kiln-orange hover:bg-kiln-orange/10"
          >
            {runningTask ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-2 h-3.5 w-3.5" />}
            Run Now
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-3.5 w-3.5" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>

      {/* ── Main Layout: Content + Sidebar ── */}
      <div className="flex gap-6">
        {/* ── Main Content ── */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* ── Pipeline Flow ── */}
          <div className="flex flex-col lg:flex-row items-stretch gap-0">
            {/* TRIGGER BLOCK */}
            <div className="w-full lg:w-[260px] shrink-0">
              <div className="h-full rounded-xl border border-dashed border-blue-500/30 bg-blue-500/[0.03] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                    <TriggerIcon className="h-4.5 w-4.5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-400">Trigger</p>
                    <p className="text-[10px] text-muted-foreground">{triggerLabels[triggerType]}</p>
                  </div>
                </div>

                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as typeof triggerType)}
                  className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground mb-3"
                >
                  <option value="MANUAL">Manual</option>
                  <option value="SCHEDULE">Schedule</option>
                  <option value="WEBHOOK">Webhook</option>
                  <option value="EVENT">Event</option>
                </select>

                {triggerType === "MANUAL" && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Click &quot;Run Now&quot; or trigger via API / MCP tools.
                  </p>
                )}

                {triggerType === "SCHEDULE" && (
                  <div className="space-y-2">
                    <select
                      value={(triggerConfig.schedule as string) || "daily"}
                      onChange={(e) => setTriggerConfig({ ...triggerConfig, schedule: e.target.value, cron: e.target.value === "hourly" ? "0 * * * *" : e.target.value === "daily" ? "0 9 * * *" : "0 9 * * 1" })}
                      className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <option value="hourly">Every hour</option>
                      <option value="daily">Daily at 9 AM</option>
                      <option value="weekly">Weekly (Monday)</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Custom cron: 0 9 * * *"
                      value={(triggerConfig.cron as string) || ""}
                      onChange={(e) => setTriggerConfig({ ...triggerConfig, cron: e.target.value })}
                      className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground font-mono"
                    />
                  </div>
                )}

                {triggerType === "WEBHOOK" && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground">Webhook URL:</p>
                    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
                      <code className="flex-1 text-[10px] text-foreground truncate">{webhookUrl}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                          setWebhookCopied(true);
                          setTimeout(() => setWebhookCopied(false), 2000);
                        }}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        {webhookCopied ? <Check className="h-3 w-3 text-kiln-green" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                )}

                {triggerType === "EVENT" && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground">Source Agent:</p>
                    <select
                      value={(triggerConfig.sourceAgentId as string) || ""}
                      onChange={(e) => setTriggerConfig({ ...triggerConfig, sourceAgentId: e.target.value })}
                      className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <option value="">Select agent...</option>
                      {allAgents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* PRE-PROCESS INSERT POINT */}
            {preProcessConfig.enabled ? (
              <>
                <PipelineArrow />
                <PipelineArrowDown />
                {/* PRE-PROCESS BLOCK */}
                <div className="w-full lg:w-[280px] shrink-0">
                  <div className="h-full rounded-xl border border-dashed border-border/30 bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/10">
                          <Filter className="h-4.5 w-4.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pre-Process</p>
                          <p className="text-[10px] text-muted-foreground">Filter & Transform</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setPreProcessConfig({ ...preProcessConfig, enabled: false })}
                        className="text-[10px] text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="rounded-lg bg-muted/20 px-1">
                      <PreProcessBlock config={preProcessConfig} onChange={setPreProcessConfig} />
                    </div>
                    <p className="mt-2 text-center text-[9px] text-muted-foreground/60">No LLM call · No credits</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* "+ Add Pre-Process" link between Trigger and Process */}
                <div className="hidden lg:flex items-center justify-center w-6 shrink-0">
                  <button
                    onClick={() => setPreProcessConfig({ ...preProcessConfig, enabled: true })}
                    className="group flex flex-col items-center gap-0.5"
                    title="Add Pre-Process block"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
                      <line x1="12" y1="0" x2="12" y2="24" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                    </svg>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
                      <line x1="12" y1="0" x2="12" y2="24" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                    </svg>
                  </button>
                </div>
                <div className="flex lg:hidden items-center justify-center h-8">
                  <button
                    onClick={() => setPreProcessConfig({ ...preProcessConfig, enabled: true })}
                    className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add Pre-Process
                  </button>
                </div>
              </>
            )}

            <PipelineArrow />
            <PipelineArrowDown />

            {/* PROCESS BLOCK */}
            <div className="flex-1 min-w-0">
              <div className="h-full rounded-xl border border-kiln-orange/30 bg-kiln-orange/[0.02] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-kiln-orange/10">
                      <Brain className="h-4.5 w-4.5 text-kiln-orange" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-kiln-orange">Process</p>
                      <p className="text-[10px] text-muted-foreground">Instructions</p>
                    </div>
                  </div>
                  {modelDef && (
                    <span className="rounded-lg bg-muted px-2 py-1 text-[10px] font-medium text-foreground/70">
                      {modelDef.shortLabel} · {getCreditCost(llmModel)} credits
                    </span>
                  )}
                </div>

                {/* Model selector — wraps to vertical stack when space is tight */}
                <div className="mb-3 flex flex-wrap gap-2">
                  <select
                    value={modelProvider}
                    onChange={(e) => {
                      const p = e.target.value as ProviderKey;
                      setModelProvider(p);
                      const models = getModelsForProvider(p);
                      if (models.length > 0) setLlmModel(models[0].id);
                    }}
                    className="min-w-[140px] flex-1 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground"
                  >
                    {(Object.keys(PROVIDERS) as ProviderKey[]).map((pk) => (
                      <option key={pk} value={pk}>{PROVIDERS[pk].label}</option>
                    ))}
                  </select>
                  <select
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="min-w-[180px] flex-[2] rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground"
                  >
                    {getModelsForProvider(modelProvider as ProviderKey).map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {/* System Prompt */}
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={10}
                  placeholder="Describe what this agent should do when triggered..."
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground focus:border-kiln-orange/50 focus:outline-none focus:ring-1 focus:ring-kiln-orange/30 resize-none"
                />

                {/* Collapsible: Knowledge Base */}
                <button
                  onClick={() => setKnowledgeOpen(!knowledgeOpen)}
                  className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 text-xs font-medium text-foreground hover:bg-card transition-colors"
                >
                  {knowledgeOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <BookOpen className="h-3 w-3 text-muted-foreground" />
                  Knowledge Base
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {agent.knowledgeBases.length} sources
                  </span>
                </button>
                {knowledgeOpen && (
                  <div className="mt-1 rounded-lg border border-border bg-card/30 p-3 text-xs text-muted-foreground">
                    {agent.knowledgeBases.length === 0 ? (
                      <p>No knowledge sources. <Link href={`/dashboard/agents/${agent.id}`} className="text-kiln-orange underline">Add knowledge</Link></p>
                    ) : (
                      <ul className="space-y-1">
                        {agent.knowledgeBases.map((kb) => (
                          <li key={kb.id} className="flex items-center gap-2">
                            <div className={cn("h-1.5 w-1.5 rounded-full", kb.embeddingStatus === "READY" ? "bg-kiln-green" : "bg-amber-500")} />
                            <span className="text-foreground">{kb.sourceName}</span>
                            <span className="text-[10px]">({kb.chunkCount} chunks)</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Collapsible: Actions & Tools */}
                <button
                  onClick={() => setActionsOpen(!actionsOpen)}
                  className="mt-2 flex w-full items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 text-xs font-medium text-foreground hover:bg-card transition-colors"
                >
                  {actionsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Zap className="h-3 w-3 text-muted-foreground" />
                  Actions & Tools
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {agent.actions.filter((a) => a.enabled).length} active
                  </span>
                </button>
                {actionsOpen && (
                  <div className="mt-1 rounded-lg border border-border bg-card/30 p-3 text-xs text-muted-foreground">
                    {agent.actions.filter((a) => a.enabled).length === 0 ? (
                      <p>No active actions. <Link href={`/dashboard/agents/${agent.id}`} className="text-kiln-orange underline">Configure actions</Link></p>
                    ) : (
                      <ul className="space-y-1">
                        {agent.actions.filter((a) => a.enabled).map((action) => (
                          <li key={action.id} className="flex items-center gap-2">
                            <CheckCircle2 className="h-3 w-3 text-kiln-green" />
                            <span className="text-foreground">{action.type.replace(/_/g, " ")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* POST-PROCESS INSERT POINT */}
            {postProcessConfig.enabled ? (
              <>
                <PipelineArrow />
                <PipelineArrowDown />
                {/* POST-PROCESS BLOCK */}
                <div className="w-full lg:w-[300px] shrink-0">
                  <div className="h-full rounded-xl border border-dashed border-border/30 bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/10">
                          <Filter className="h-4.5 w-4.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Post-Process</p>
                          <p className="text-[10px] text-muted-foreground">Transform & Route</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setPostProcessConfig({ ...postProcessConfig, enabled: false })}
                        className="text-[10px] text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="rounded-lg bg-muted/20 px-1">
                      <PostProcessBlock config={postProcessConfig} onChange={setPostProcessConfig} agents={allAgents} />
                    </div>
                    <p className="mt-2 text-center text-[9px] text-muted-foreground/60">No LLM call · No credits</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* "+ Add Post-Process" link between Process and Output */}
                <div className="hidden lg:flex items-center justify-center w-6 shrink-0">
                  <button
                    onClick={() => setPostProcessConfig({ ...postProcessConfig, enabled: true })}
                    className="group flex flex-col items-center gap-0.5"
                    title="Add Post-Process block"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
                      <line x1="12" y1="0" x2="12" y2="24" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                    </svg>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
                      <line x1="12" y1="0" x2="12" y2="24" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                    </svg>
                  </button>
                </div>
                <div className="flex lg:hidden items-center justify-center h-8">
                  <button
                    onClick={() => setPostProcessConfig({ ...postProcessConfig, enabled: true })}
                    className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add Post-Process
                  </button>
                </div>
              </>
            )}

            <PipelineArrow />
            <PipelineArrowDown />

            {/* OUTPUT BLOCK */}
            <div className="w-full lg:w-[260px] shrink-0">
              <div className="h-full rounded-xl border border-dashed border-kiln-green/30 bg-kiln-green/[0.02] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-kiln-green/10">
                    <OutputIcon className="h-4.5 w-4.5 text-kiln-green" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-kiln-green">Output</p>
                    <p className="text-[10px] text-muted-foreground">{outputLabels[outputType]}</p>
                  </div>
                </div>

                <select
                  value={outputType}
                  onChange={(e) => setOutputType(e.target.value as typeof outputType)}
                  className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground mb-3"
                >
                  <option value="NONE">None (result only)</option>
                  <option value="EMAIL">Send Email</option>
                  <option value="HTTP_REQUEST">HTTP Request</option>
                  <option value="NEXT_AGENT">Next Agent</option>
                  <option value="WEBHOOK">Webhook</option>
                  <option value="CUSTOM_CODE">Custom Code</option>
                </select>

                {outputType === "NONE" && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Result stored in run history. No external action.
                  </p>
                )}

                {outputType === "EMAIL" && (
                  <div className="space-y-2">
                    <input
                      type="email"
                      placeholder="recipient@example.com"
                      value={(outputConfig.email as string) || ""}
                      onChange={(e) => setOutputConfig({ ...outputConfig, email: e.target.value })}
                      className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                    />
                    <input
                      type="text"
                      placeholder="Email subject"
                      value={(outputConfig.subject as string) || ""}
                      onChange={(e) => setOutputConfig({ ...outputConfig, subject: e.target.value })}
                      className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                    />
                  </div>
                )}

                {outputType === "HTTP_REQUEST" && (
                  <div className="space-y-2">
                    <input
                      type="url"
                      placeholder="https://api.example.com/..."
                      value={(outputConfig.url as string) || ""}
                      onChange={(e) => setOutputConfig({ ...outputConfig, url: e.target.value })}
                      className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                    />
                    <select
                      value={(outputConfig.method as string) || "POST"}
                      onChange={(e) => setOutputConfig({ ...outputConfig, method: e.target.value })}
                      className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                    </select>
                  </div>
                )}

                {outputType === "NEXT_AGENT" && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground">Target Agent:</p>
                    <select
                      value={(outputConfig.targetAgentId as string) || ""}
                      onChange={(e) => setOutputConfig({ ...outputConfig, targetAgentId: e.target.value })}
                      className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <option value="">Select agent...</option>
                      {allAgents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {outputType === "WEBHOOK" && (
                  <input
                    type="url"
                    placeholder="https://webhook.site/..."
                    value={(outputConfig.url as string) || ""}
                    onChange={(e) => setOutputConfig({ ...outputConfig, url: e.target.value })}
                    className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
                  />
                )}

                {outputType === "CUSTOM_CODE" && (
                  <textarea
                    placeholder="// JavaScript code..."
                    value={(outputConfig.code as string) || ""}
                    onChange={(e) => setOutputConfig({ ...outputConfig, code: e.target.value })}
                    rows={4}
                    className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 font-mono text-[10px] text-foreground resize-none"
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── I/O Schema Editor ── */}
          <IoSchemaEditor
            inputSchema={inputSchema}
            outputSchema={outputSchema}
            strictOutputValidation={strictOutputValidation}
            onChange={(next) => {
              setInputSchema(next.inputSchema);
              setOutputSchema(next.outputSchema);
              setStrictOutputValidation(next.strictOutputValidation);
            }}
          />

          {/* ── Runs Timeline ── */}
          <div className="rounded-xl border border-border bg-card/50">
            <button
              onClick={() => setRunsOpen(!runsOpen)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-card/80 transition-colors rounded-t-xl"
            >
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-kiln-orange" />
                Runs
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{runs.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); loadRuns(); }}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
                {runsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </button>

            {runsOpen && (
              <div className="border-t border-border">
                {runs.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <FlaskConical className="mb-2 h-6 w-6" />
                    <p className="text-xs font-medium">No runs yet</p>
                    <p className="text-[10px]">Click &quot;Run Now&quot; to execute this task agent.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {runs.slice(0, 10).map((run) => (
                      <div key={run.id}>
                        <button
                          onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-xs hover:bg-card/30 transition-colors"
                        >
                          {run.status === "SUCCESS" ? (
                            <CheckCircle2 className="h-4 w-4 text-kiln-green shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                          )}
                          <span className="text-muted-foreground">{run.triggerType}</span>
                          <span className="flex-1 truncate text-left text-foreground">
                            {run.output ? run.output.slice(0, 80) + (run.output.length > 80 ? "..." : "") : run.error || "—"}
                          </span>
                          <span className="text-muted-foreground shrink-0">
                            {run.duration ? `${(run.duration / 1000).toFixed(1)}s` : "—"}
                          </span>
                          <span className="text-muted-foreground shrink-0">
                            {new Date(run.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {run.creditsUsed > 0 && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                              {run.creditsUsed} cr
                            </span>
                          )}
                          {expandedRun === run.id ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                        </button>
                        {expandedRun === run.id && (
                          <div className="border-t border-border bg-card/20 px-4 py-3 space-y-2">
                            {!!run.input && (
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground mb-1">Input</p>
                                <pre className="rounded bg-muted p-2 text-[10px] text-foreground overflow-auto max-h-24">
                                  {typeof run.input === "string" ? run.input : JSON.stringify(run.input, null, 2)}
                                </pre>
                              </div>
                            )}
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1">Output</p>
                              <pre className="rounded bg-muted p-2 text-[10px] text-foreground overflow-auto max-h-48 whitespace-pre-wrap">
                                {run.output || run.error || "No output"}
                              </pre>
                            </div>
                            {run.outputAction && (
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground mb-1">Output Action</p>
                                <pre className="rounded bg-muted p-2 text-[10px] text-foreground overflow-auto max-h-24">
                                  {JSON.stringify(run.outputAction, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Floating Sidebar ── */}
        {sidebarOpen && (
          <div className="hidden lg:block w-[280px] shrink-0">
            <div className="sticky top-6 space-y-4">
              {/* Settings */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Settings</h3>

                <label className="flex items-center justify-between">
                  <span className="text-xs text-foreground flex items-center gap-1.5">
                    <Brain className="h-3 w-3 text-muted-foreground" />
                    Memory
                  </span>
                  <button
                    onClick={() => setMemoryEnabled(!memoryEnabled)}
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors",
                      memoryEnabled ? "bg-kiln-orange" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                      memoryEnabled ? "left-[18px]" : "left-0.5"
                    )} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <span className="text-xs text-foreground flex items-center gap-1.5">
                    <Shield className="h-3 w-3 text-muted-foreground" />
                    AI Disclaimer
                  </span>
                  <button
                    onClick={() => setShowAiDisclaimer(!showAiDisclaimer)}
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors",
                      showAiDisclaimer ? "bg-kiln-orange" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                      showAiDisclaimer ? "left-[18px]" : "left-0.5"
                    )} />
                  </button>
                </label>
              </div>

              {/* Test Panel */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FlaskConical className="h-3 w-3" />
                  Test with Input
                </h3>
                <textarea
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder="Enter test input or leave empty for default..."
                  rows={4}
                  className="w-full rounded-lg border border-border bg-card/50 px-2.5 py-2 text-xs text-foreground font-mono resize-none focus:border-kiln-orange/50 focus:outline-none"
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={testRunning}
                  onClick={handleTestRun}
                >
                  {testRunning ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Play className="mr-2 h-3 w-3" />}
                  Test Run
                </Button>
                {testOutput && (
                  <div className="rounded-lg border border-border bg-muted p-2 max-h-48 overflow-auto">
                    <pre className="text-[10px] text-foreground whitespace-pre-wrap">{testOutput}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
