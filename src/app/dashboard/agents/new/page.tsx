"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, Upload, Zap, Play, Sparkles, Code2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BuilderChat } from "@/components/agents/builder-chat";
import { AgentPreview } from "@/components/agents/agent-preview";
import { AgentWizard } from "@/components/agents/agent-wizard";
import type { GeneratedAgentConfig } from "@/types/agent";

type AgentMode = "CHAT" | "TASK" | "WIZARD";
type TaskStep = "describe" | "trigger" | "tools" | "output" | "review";

export default function NewAgentPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<AgentMode | null>(null);
  const [config, setConfig] = useState<GeneratedAgentConfig | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Task Agent builder state
  const [taskStep, setTaskStep] = useState<TaskStep>("describe");
  const [taskName, setTaskName] = useState("");
  const [taskInstructions, setTaskInstructions] = useState("");
  const [triggerType, setTriggerType] = useState<"MANUAL" | "SCHEDULE" | "WEBHOOK" | "EVENT">("MANUAL");
  const [cronExpression, setCronExpression] = useState("0 9 * * *");
  const [outputType, setOutputType] = useState<"NONE" | "HTTP_REQUEST" | "EMAIL" | "NEXT_AGENT" | "WEBHOOK" | "CUSTOM_CODE">("NONE");
  const [outputConfig, setOutputConfig] = useState<Record<string, string>>({});
  const [taskSaving, setTaskSaving] = useState(false);

  function handleConfigGenerated(newConfig: GeneratedAgentConfig) {
    setConfig(newConfig);
    setStreamingText("");
  }

  function handleStreamingUpdate(text: string) {
    setStreamingText(text);
  }

  async function handleSave() {
    if (!config) return;
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.name,
          slug: config.slug,
          description: config.personality?.tone || "",
          systemPrompt: config.system_prompt,
          personality: config.personality,
          welcomeMessage: config.welcome_message,
          suggestedQuestions: config.suggested_questions,
          suggestedActions: config.suggested_actions,
          agentMode: "CHAT",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error saving");
      }

      const agent = await res.json();
      router.push(`/dashboard/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsSaving(false);
    }
  }

  async function handleSaveTaskAgent() {
    if (!taskName.trim() || !taskInstructions.trim()) return;
    setTaskSaving(true);
    setError(null);

    try {
      const slug = taskName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Date.now().toString(36).slice(-4);
      const systemPrompt = `You are a task execution agent. Your job is to complete the following task and return a clear, structured result.\n\nTask Instructions:\n${taskInstructions}`;

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: taskName,
          slug,
          description: taskInstructions.slice(0, 200),
          systemPrompt,
          personality: { tone: "professional", language: "en", formality: "neutral" },
          welcomeMessage: "",
          suggestedQuestions: [],
          suggestedActions: [],
          agentMode: "TASK",
          triggerType,
          triggerConfig: triggerType === "SCHEDULE" ? { cron: cronExpression } : null,
          outputType,
          outputConfig: Object.keys(outputConfig).length > 0 ? outputConfig : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error saving");
      }

      const agent = await res.json();
      router.push(`/dashboard/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setTaskSaving(false);
    }
  }

  function parseYaml(text: string): Record<string, unknown> {
    // Simple YAML parser for flat/nested key-value configs
    const result: Record<string, unknown> = {};
    const lines = text.split("\n");
    let currentObj: Record<string, unknown> | null = null;
    let listKey = "";
    let listItems: string[] = [];

    function flushList() {
      if (listKey && listItems.length > 0) {
        if (currentObj) currentObj[listKey] = listItems;
        else result[listKey] = listItems;
        listItems = [];
        listKey = "";
      }
    }

    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");
      if (!line.trim() || line.trim().startsWith("#")) continue;

      // List item
      const listMatch = line.match(/^(\s*)- (.+)$/);
      if (listMatch) {
        const value = listMatch[2].trim().replace(/^["']|["']$/g, "");
        listItems.push(value);
        continue;
      }

      flushList();

      const kvMatch = line.match(/^(\s*)(\w+)\s*:\s*(.*)$/);
      if (!kvMatch) continue;

      const indent = kvMatch[1].length;
      const key = kvMatch[2];
      let val: string | boolean | number | null = kvMatch[3].trim();

      // Remove quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }

      // Empty value = start of nested object or list
      if (val === "" || val === "|" || val === ">") {
        if (indent === 0) {
          currentObj = {};
          result[key] = currentObj;
          listKey = key;
        } else if (currentObj) {
          listKey = key;
        }
        continue;
      }

      // Parse typed values
      if (val === "true") val = true;
      else if (val === "false") val = false;
      else if (val === "null" || val === "~") val = null;
      else if (/^-?\d+$/.test(val as string)) val = parseInt(val as string, 10);
      else if (/^-?\d+\.\d+$/.test(val as string)) val = parseFloat(val as string);

      if (indent > 0 && currentObj) {
        currentObj[key] = val;
      } else {
        currentObj = null;
        result[key] = val;
      }
    }
    flushList();
    return result;
  }

  async function handleImportConfig(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsSaving(true);

    try {
      const text = await file.text();
      const isYaml = file.name.endsWith(".yml") || file.name.endsWith(".yaml");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      if (isYaml) {
        data = parseYaml(text);
        // YAML CLI format uses snake_case — map to camelCase
        if (data.system_prompt && !data.systemPrompt) data.systemPrompt = data.system_prompt;
        if (data.welcome_message && !data.welcomeMessage) data.welcomeMessage = data.welcome_message;
        if (data.suggested_questions && !data.suggestedQuestions) data.suggestedQuestions = data.suggested_questions;
        if (data.agent_mode && !data.agentMode) data.agentMode = data.agent_mode;
        if (data.llm_model && !data.llmModel) data.llmModel = data.llm_model;
        if (data.model_provider && !data.modelProvider) data.modelProvider = data.model_provider;
        if (data.trigger_type && !data.triggerType) data.triggerType = data.trigger_type;
        if (data.output_type && !data.outputType) data.outputType = data.output_type;
        if (data.white_label && !data.whiteLabel) data.whiteLabel = data.white_label;
        if (data.prompt_branches && !data.promptBranches) data.promptBranches = data.prompt_branches;
        if (data.memory_enabled && !data.memoryEnabled) data.memoryEnabled = data.memory_enabled;
        if (data.image_analysis_enabled && !data.imageAnalysisEnabled) data.imageAnalysisEnabled = data.image_analysis_enabled;
        if (data.show_ai_disclaimer !== undefined && data.showAiDisclaimer === undefined) data.showAiDisclaimer = data.show_ai_disclaimer;
        if (data.agent_type && !data.agentType) data.agentType = data.agent_type;
        if (data.show_powered_by !== undefined && data.showPoweredBy === undefined) data.showPoweredBy = data.show_powered_by;
      } else {
        data = JSON.parse(text);
      }

      // Validate required fields
      if (!data.name || !data.systemPrompt) {
        throw new Error("Invalid config: name and systemPrompt are required");
      }

      const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const agentMode = data.agentMode === "TASK" ? "TASK" : "CHAT";

      // Map action types to suggested actions format
      const actionTypeMap: Record<string, string> = {
        BOOK_APPOINTMENT: "booking",
        COLLECT_EMAIL: "email",
        SCORE_LEAD: "lead_scoring",
        SEND_EMAIL: "send_email",
        NOTIFY_OWNER: "notification",
        FIRE_WEBHOOK: "webhook",
        HANDOFF_HUMAN: "handoff",
      };
      const suggestedActions = (data.actions || [])
        .filter((a: { enabled: boolean }) => a.enabled)
        .map((a: { type: string }) => actionTypeMap[a.type])
        .filter(Boolean);

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
          description: data.description || "",
          systemPrompt: data.systemPrompt,
          personality: data.personality || {},
          welcomeMessage: data.welcomeMessage || "",
          suggestedQuestions: data.suggestedQuestions || [],
          suggestedActions,
          agentMode,
        }),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Error creating agent");
      }

      const agent = await res.json();

      // Update additional fields via PATCH
      const updateFields: Record<string, unknown> = {};
      if (data.memoryEnabled) updateFields.memoryEnabled = true;
      if (data.imageAnalysisEnabled) updateFields.imageAnalysisEnabled = true;
      if (data.showAiDisclaimer === false) updateFields.showAiDisclaimer = false;
      if (data.llmModel) updateFields.llmModel = data.llmModel;
      if (data.modelProvider) updateFields.modelProvider = data.modelProvider;
      if (data.whiteLabel) updateFields.whiteLabel = data.whiteLabel;
      if (data.promptBranches) updateFields.promptBranches = data.promptBranches;
      if (data.agentType === "INTERNAL") updateFields.agentType = "INTERNAL";
      if (data.showPoweredBy === false) updateFields.showPoweredBy = false;
      // Task agent fields
      if (data.triggerType) updateFields.triggerType = data.triggerType;
      if (data.triggerConfig) updateFields.triggerConfig = data.triggerConfig;
      if (data.outputType) updateFields.outputType = data.outputType;
      if (data.outputConfig) updateFields.outputConfig = data.outputConfig;

      if (Object.keys(updateFields).length > 0) {
        await fetch(`/api/agents/${agent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateFields),
        });
      }

      router.push(`/dashboard/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid config file");
      setIsSaving(false);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ─── Wizard Mode ────────────────────────────────────────
  if (mode === "WIZARD") {
    return <AgentWizard onBack={() => setMode(null)} />;
  }

  // ─── Mode Selection Screen ────────────────────────────────
  if (!mode) {
    return (
      <div className="flex h-[calc(100vh-3rem)] flex-col">
        <div className="flex items-center border-b border-border px-4 py-3">
          <Link
            href="/dashboard/agents"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="ml-3">
            <h1 className="text-sm font-semibold text-foreground">New Agent</h1>
            <p className="text-xs text-muted-foreground">Choose how to create your agent</p>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="mx-auto max-w-3xl px-6">
            <div className="mb-8 text-center">
              <h2 className="font-serif text-3xl text-foreground">Create a new agent</h2>
              <p className="mt-2 text-sm text-muted-foreground">Choose your preferred creation method.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Guided Wizard — Recommended */}
              <button
                onClick={() => setMode("WIZARD")}
                className="relative flex flex-col items-start rounded-xl border-2 border-kiln-orange/30 bg-card p-6 text-left transition-all hover:border-kiln-orange/60 hover:bg-kiln-orange/5"
              >
                <span className="absolute -top-2.5 right-4 rounded-full bg-kiln-orange px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  Recommended
                </span>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-kiln-orange/10 mb-4">
                  <Sparkles className="h-6 w-6 text-kiln-orange" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Guided Builder</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Step-by-step wizard. Choose a goal, add business info, customize style. Auto-generates an optimized agent.
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-kiln-orange">
                  Start Wizard <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                </div>
              </button>

              {/* Quick Create — Conversational */}
              <button
                onClick={() => setMode("CHAT")}
                className="flex flex-col items-start rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-blue-500/30 hover:bg-blue-500/5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 mb-4">
                  <Code2 className="h-6 w-6 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Quick Create</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Describe your agent in natural language. AI generates the config. For experienced users who know what they want.
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-blue-500">
                  Open Builder <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                </div>
              </button>

              {/* Task Agent */}
              <button
                onClick={() => setMode("TASK")}
                className="flex flex-col items-start rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-violet-500/30 hover:bg-violet-500/5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 mb-4">
                  <Zap className="h-6 w-6 text-violet-500" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Task Agent</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Autonomous agent that executes tasks in the background. Set triggers, define instructions, configure outputs.
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-violet-500">
                  Create Task Agent <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                </div>
              </button>
            </div>
            <div className="mt-6 text-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Upload className="mr-1.5 inline h-3.5 w-3.5" />
                Import from config file
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Task Agent Builder ──────────────────────────────────
  if (mode === "TASK") {
    const steps: { id: TaskStep; label: string }[] = [
      { id: "describe", label: "Describe" },
      { id: "trigger", label: "Trigger" },
      { id: "output", label: "Output" },
      { id: "review", label: "Review" },
    ];
    const stepIdx = steps.findIndex((s) => s.id === taskStep);

    return (
      <div className="flex h-[calc(100vh-3rem)] flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => taskStep === "describe" ? setMode(null) : setTaskStep(steps[stepIdx - 1].id)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-kiln-orange/10">
              <Zap className="h-4 w-4 text-kiln-orange" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">New Task Agent</h1>
              <p className="text-xs text-muted-foreground">Step {stepIdx + 1} of {steps.length}: {steps[stepIdx].label}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {error && <p className="text-xs text-destructive">{error}</p>}
            {taskStep === "review" && (
              <Button onClick={handleSaveTaskAgent} disabled={taskSaving} size="sm">
                {taskSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                Create Agent
              </Button>
            )}
          </div>
        </div>

        {/* Step Progress */}
        <div className="flex items-center gap-1 border-b border-border px-6 py-2">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                onClick={() => i <= stepIdx && setTaskStep(s.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  i === stepIdx ? "bg-kiln-orange text-white" :
                  i < stepIdx ? "bg-kiln-orange/10 text-kiln-orange cursor-pointer" :
                  "bg-muted text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
              {i < steps.length - 1 && <div className="h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-8">
            {taskStep === "describe" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">What should this agent do?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Give your task agent a name and describe its job.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Agent Name</label>
                  <input
                    type="text"
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    placeholder="e.g. Daily Lead Report, Content Writer, Data Processor"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Task Instructions</label>
                  <textarea
                    value={taskInstructions}
                    onChange={(e) => setTaskInstructions(e.target.value)}
                    rows={8}
                    placeholder="Describe what this agent should do when triggered. Be specific about the expected input, what to do with it, and what format the output should be in.&#10;&#10;Example: Analyze the incoming webhook data containing a customer support ticket. Categorize the issue (billing, technical, general), extract the customer email, and write a professional response."
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange resize-none"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setTaskStep("trigger")} disabled={!taskName.trim() || !taskInstructions.trim()}>
                    Next: Trigger <ArrowLeft className="ml-2 h-3.5 w-3.5 rotate-180" />
                  </Button>
                </div>
              </div>
            )}

            {taskStep === "trigger" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">When should this agent run?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Select what triggers this task agent.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    { id: "MANUAL" as const, label: "Manual", desc: "Run on demand via dashboard, API, or MCP", icon: Play },
                    { id: "SCHEDULE" as const, label: "Schedule", desc: "Run on a recurring cron schedule", icon: Zap },
                    { id: "WEBHOOK" as const, label: "Webhook", desc: "Auto-generated URL triggers the agent", icon: Zap },
                    { id: "EVENT" as const, label: "Event", desc: "When another agent completes a run", icon: Zap },
                  ]).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTriggerType(t.id)}
                      className={`flex flex-col items-start rounded-lg border p-4 text-left transition-all ${
                        triggerType === t.id ? "border-kiln-orange bg-kiln-orange/5" : "border-border hover:border-kiln-orange/30"
                      }`}
                    >
                      <h4 className="text-sm font-semibold text-foreground">{t.label}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
                    </button>
                  ))}
                </div>
                {triggerType === "SCHEDULE" && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Schedule</label>
                    <select
                      value={cronExpression}
                      onChange={(e) => setCronExpression(e.target.value)}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    >
                      <option value="0 * * * *">Every hour</option>
                      <option value="0 9 * * *">Daily at 9:00 AM</option>
                      <option value="0 9 * * 1">Weekly on Mondays</option>
                      <option value="0 9 1 * *">Monthly on the 1st</option>
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">Cron: {cronExpression}</p>
                  </div>
                )}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setTaskStep("describe")}>Back</Button>
                  <Button onClick={() => setTaskStep("output")}>
                    Next: Output <ArrowLeft className="ml-2 h-3.5 w-3.5 rotate-180" />
                  </Button>
                </div>
              </div>
            )}

            {taskStep === "output" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">What happens with the result?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Configure what to do with the agent&apos;s output.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    { id: "NONE" as const, label: "Log Only", desc: "Just save the result" },
                    { id: "EMAIL" as const, label: "Send Email", desc: "Email the result to someone" },
                    { id: "HTTP_REQUEST" as const, label: "HTTP Request", desc: "POST result to an external URL" },
                    { id: "NEXT_AGENT" as const, label: "Next Agent", desc: "Pass result to another agent" },
                    { id: "WEBHOOK" as const, label: "Webhook", desc: "POST to a webhook URL" },
                    { id: "CUSTOM_CODE" as const, label: "Custom Code", desc: "Run JS on the result" },
                  ]).map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setOutputType(o.id)}
                      className={`flex flex-col items-start rounded-lg border p-4 text-left transition-all ${
                        outputType === o.id ? "border-kiln-orange bg-kiln-orange/5" : "border-border hover:border-kiln-orange/30"
                      }`}
                    >
                      <h4 className="text-sm font-semibold text-foreground">{o.label}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">{o.desc}</p>
                    </button>
                  ))}
                </div>
                {outputType === "EMAIL" && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Recipient Email</label>
                    <input
                      type="email"
                      value={outputConfig.email || ""}
                      onChange={(e) => setOutputConfig({ ...outputConfig, email: e.target.value })}
                      placeholder="recipient@example.com"
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange"
                    />
                  </div>
                )}
                {(outputType === "HTTP_REQUEST" || outputType === "WEBHOOK") && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">URL</label>
                    <input
                      type="url"
                      value={outputConfig.url || ""}
                      onChange={(e) => setOutputConfig({ ...outputConfig, url: e.target.value })}
                      placeholder="https://example.com/webhook"
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange"
                    />
                  </div>
                )}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setTaskStep("trigger")}>Back</Button>
                  <Button onClick={() => setTaskStep("review")}>
                    Next: Review <ArrowLeft className="ml-2 h-3.5 w-3.5 rotate-180" />
                  </Button>
                </div>
              </div>
            )}

            {taskStep === "review" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Review your Task Agent</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Everything look good? Create your agent.</p>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Name", value: taskName },
                    { label: "Instructions", value: taskInstructions.slice(0, 200) + (taskInstructions.length > 200 ? "..." : "") },
                    { label: "Trigger", value: triggerType + (triggerType === "SCHEDULE" ? ` (${cronExpression})` : "") },
                    { label: "Output", value: outputType === "NONE" ? "Log only" : `${outputType}${outputConfig.email ? ` → ${outputConfig.email}` : ""}${outputConfig.url ? ` → ${outputConfig.url}` : ""}` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-border bg-card p-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{item.label}</p>
                      <p className="mt-1 text-sm text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setTaskStep("output")}>Back</Button>
                  <Button onClick={handleSaveTaskAgent} disabled={taskSaving}>
                    {taskSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                    Create Task Agent
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Chat Agent Builder (existing) ─────────────────────────
  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode(null)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {config?.name || "New Chat Agent"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {config ? "Configuration Generated" : "Describe your Agent"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.yml,.yaml"
            onChange={handleImportConfig}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSaving}
          >
            <Upload className="mr-2 h-3.5 w-3.5" />
            Import Config
          </Button>
          {config && (
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-2 h-3.5 w-3.5" />
              )}
              Save Agent
            </Button>
          )}
        </div>
      </div>

      {/* Split-Screen */}
      <div className="flex flex-1 overflow-hidden">
        {/* Links: Chat-Interface */}
        <div className="w-1/2 border-r border-border overflow-hidden">
          <BuilderChat
            onConfigGenerated={handleConfigGenerated}
            onStreamingUpdate={handleStreamingUpdate}
          />
        </div>

        {/* Rechts: Live-Vorschau */}
        <div className="w-1/2 bg-background/50 overflow-hidden">
          <AgentPreview config={config} streamingText={streamingText} />
        </div>
      </div>
    </div>
  );
}
