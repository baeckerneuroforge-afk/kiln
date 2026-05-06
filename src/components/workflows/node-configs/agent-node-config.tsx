"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { ExpressionInput } from "../expression-input";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AgentSummary {
  id: string;
  name: string;
  slug: string;
  llmModel?: string;
  modelProvider?: string;
  mode?: string;
  status?: string;
  _count?: { knowledgeEntries: number };
}

/**
 * Helper: POSTs a new agent and returns the created summary or throws
 * with the API's error message. Shared between the "Create new agent"
 * inline flow (commit: inline-create) and the "Save as standalone"
 * inline-builder flow (commit: save-as-standalone).
 */
async function createAgent(payload: {
  name: string;
  systemPrompt: string;
  llmModel?: string;
  description?: string;
  welcomeMessage?: string;
}): Promise<AgentSummary> {
  const slug =
    payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) +
    "-" +
    Date.now().toString(36).slice(-4);
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      slug,
      description: payload.description ?? "",
      systemPrompt: payload.systemPrompt,
      personality: { tone: "professional", language: "en", formality: "neutral" },
      welcomeMessage: payload.welcomeMessage ?? "",
      suggestedQuestions: [],
      suggestedActions: [],
      mode: "CHAT",
      llmModel: payload.llmModel,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to create agent");
  }
  return (await res.json()) as AgentSummary;
}

type AgentMode = "existing" | "inline";

/**
 * Heuristic: when the operator has at least one agent, default to
 * "Use existing agent" (the canonical KILN pattern — agents are
 * shared across workflows). When the agent list is empty, fall back
 * to "Inline builder" so the operator isn't blocked.
 *
 * Re-evaluated only after the agent list loads. The first render
 * picks "existing" so the toggle doesn't flicker.
 */
function inferDefaultMode(
  config: Record<string, unknown>,
  agents: AgentSummary[]
): AgentMode {
  if (config.agentId) return "existing";
  if (config.systemPrompt || config.model) return "inline";
  if (agents.length === 0) return "inline";
  return "existing";
}

export function AgentNodeConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const agentId = (config.agentId as string) || "";
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AgentMode>(() => inferDefaultMode(config, []));
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.agents || [];
        setAgents(list);
        // Re-pick the default once the list lands. Only if the user
        // hasn't already deviated (no inline content + no agentId).
        if (!config.agentId && !config.systemPrompt && !config.model) {
          setMode(inferDefaultMode(config, list));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAgent = agents.find((a) => a.id === agentId);

  const filteredAgents = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        (a.llmModel?.toLowerCase().includes(q) ?? false)
    );
  }, [agents, search]);

  function switchMode(next: AgentMode) {
    setMode(next);
    if (next === "existing") {
      // Strip inline-only fields so the runtime falls back to the
      // referenced agent's own configuration.
      onChange({
        ...config,
        systemPrompt: undefined,
        model: undefined,
        temperature: undefined,
        maxTokens: undefined,
      });
    } else {
      // Strip the agent reference and seed inline defaults if blank.
      const next: Record<string, unknown> = { ...config, agentId: undefined };
      if (!next.model) next.model = "claude-sonnet-4-6";
      if (next.temperature === undefined) next.temperature = 0.7;
      if (next.maxTokens === undefined) next.maxTokens = 4096;
      onChange(next);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle — segmented control. Defaults to "Use existing"
          when the operator has at least one agent, "Inline" otherwise. */}
      <div className="inline-flex w-full items-center gap-1 rounded-lg border border-border bg-muted/50 p-0.5">
        <button
          type="button"
          onClick={() => switchMode("existing")}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode === "existing"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Bot className="h-3 w-3" />
          Use existing agent
        </button>
        <button
          type="button"
          onClick={() => switchMode("inline")}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode === "inline"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Wrench className="h-3 w-3" />
          Inline builder
        </button>
      </div>

      {mode === "existing" && (
        <ExistingAgentSection
          agentId={agentId}
          loading={loading}
          agents={filteredAgents}
          selectedAgent={selectedAgent}
          search={search}
          onSearch={setSearch}
          onSelect={(id) => onChange({ ...config, agentId: id })}
          onSwitchToInline={() => switchMode("inline")}
          onAgentCreated={(created) => {
            // Add the new agent to the local list and select it. The
            // workflow editor's local copy of the list updates instantly
            // so the operator can keep configuring without re-fetching.
            setAgents((prev) => [created, ...prev]);
            onChange({ ...config, agentId: created.id });
          }}
          totalAgents={agents.length}
        />
      )}

      {mode === "inline" && (
        <InlineAgentSection
          config={config}
          onChange={onChange}
          onSavedAsStandalone={(created) => {
            // Promote inline → standalone: register the new agent in
            // the local list, switch the toggle to "existing" with the
            // new agent selected, and strip the inline-only fields so
            // the workflow node stops carrying a duplicate copy.
            setAgents((prev) => [created, ...prev]);
            setMode("existing");
            onChange({
              agentId: created.id,
              goalOverride: config.goalOverride,
            });
          }}
        />
      )}

      {/* Custom goal override — applies in either mode. */}
      <ExpressionInput
        label="Goal Override (optional)"
        value={(config.goalOverride as string) || ""}
        onChange={(v) => onChange({ ...config, goalOverride: v })}
        placeholder="{{ input.task }}"
        multiline
        hint="Override the agent's default goal with a custom one"
      />

      {/* Output fields info */}
      <div className="rounded-lg border border-border/60 bg-muted/50 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Output Fields
        </p>
        <div className="flex flex-wrap gap-1">
          {["output", "summary", "structuredData", "tokensUsed", "cost"].map((f) => (
            <span
              key={f}
              className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border/50"
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExistingAgentSection({
  agentId,
  loading,
  agents,
  selectedAgent,
  search,
  onSearch,
  onSelect,
  onSwitchToInline,
  onAgentCreated,
  totalAgents,
}: {
  agentId: string;
  loading: boolean;
  agents: AgentSummary[];
  selectedAgent: AgentSummary | undefined;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (id: string) => void;
  onSwitchToInline: () => void;
  onAgentCreated: (created: AgentSummary) => void;
  totalAgents: number;
}) {
  const [showCreate, setShowCreate] = useState(false);
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading agents…</span>
      </div>
    );
  }

  if (totalAgents === 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3">
          <p className="text-xs text-foreground">
            You don&apos;t have any agents yet.
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="font-medium text-kiln-orange hover:text-kiln-orange/80 transition-colors"
            >
              + Create new agent
            </button>
            <button
              type="button"
              onClick={onSwitchToInline}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Or use inline builder →
            </button>
          </div>
        </div>
        {showCreate && (
          <CreateAgentInlineForm
            onClose={() => setShowCreate(false)}
            onCreated={(created) => {
              setShowCreate(false);
              onAgentCreated(created);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">
        Agent <span className="text-destructive">*</span>
      </label>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={`Search ${totalAgents} agents…`}
          className="w-full rounded-lg border border-border bg-card pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/60"
        />
      </div>

      <select
        value={agentId}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60"
      >
        <option value="">Select an agent…</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.mode === "CHAT" ? "Chat" : "Task"})
          </option>
        ))}
      </select>

      {/* "Create new agent" inline shortcut. Avoids the page-jump round-
          trip that breaks the operator's flow when they realize mid-
          configuration they need a new agent. */}
      {!showCreate ? (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-kiln-orange hover:text-kiln-orange/80 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Create new agent
        </button>
      ) : (
        <CreateAgentInlineForm
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setShowCreate(false);
            onAgentCreated(created);
          }}
        />
      )}

      {selectedAgent && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{selectedAgent.name}</p>
            <Link
              href={`/dashboard/agents/${selectedAgent.id}`}
              className="inline-flex items-center gap-1 text-[10px] text-kiln-orange hover:text-kiln-orange/80 transition-colors"
            >
              Edit agent <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border/50">
              /{selectedAgent.slug}
            </span>
            {selectedAgent.llmModel && (
              <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border/50">
                {selectedAgent.llmModel}
              </span>
            )}
            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border/50">
              {selectedAgent.mode === "CHAT" ? "Chat" : "Task"}
            </span>
            {selectedAgent._count?.knowledgeEntries ? (
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20">
                {selectedAgent._count.knowledgeEntries} KB entries
              </span>
            ) : null}
            {selectedAgent.status && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded border ${
                  selectedAgent.status === "LIVE"
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-muted/50 text-muted-foreground border-border"
                }`}
              >
                {selectedAgent.status}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InlineAgentSection({
  config,
  onChange,
  onSavedAsStandalone,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  onSavedAsStandalone: (created: AgentSummary) => void;
}) {
  const systemPrompt = (config.systemPrompt as string) || "";
  const model = (config.model as string) || "claude-sonnet-4-6";
  const temperature =
    typeof config.temperature === "number" ? config.temperature : 0.7;
  const maxTokens =
    typeof config.maxTokens === "number" ? config.maxTokens : 4096;
  const tooShort = systemPrompt.trim().length > 0 && systemPrompt.trim().length < 20;

  // "Save as standalone" — promotes the inline-only config to a real
  // reusable agent. We need a name; if the operator hasn't entered one
  // yet, we surface a small inline name prompt rather than blocking.
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const canPromote = systemPrompt.trim().length >= 20;

  async function handleSaveAsStandalone() {
    setSaveError(null);
    setSaving(true);
    try {
      const created = await createAgent({
        name: saveAsName.trim(),
        systemPrompt: systemPrompt.trim(),
        llmModel: model.trim() || undefined,
      });
      onSavedAsStandalone(created);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          System prompt <span className="text-destructive">*</span>
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
          rows={5}
          placeholder="You are a helpful assistant that …"
          className={cn(
            "mt-1.5 w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/60 resize-none",
            tooShort ? "border-destructive/40" : "border-border"
          )}
        />
        {tooShort && (
          <p className="mt-1 text-[10px] text-destructive">
            System prompt is very short — be specific about role and goal.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Model</label>
          <input
            value={model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
            placeholder="claude-sonnet-4-6"
            className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/60"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Temperature
          </label>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) =>
              onChange({ ...config, temperature: parseFloat(e.target.value) })
            }
            className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Max tokens</label>
        <input
          type="number"
          min={64}
          max={32000}
          step={64}
          value={maxTokens}
          onChange={(e) =>
            onChange({ ...config, maxTokens: parseInt(e.target.value, 10) || 4096 })
          }
          className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60"
        />
      </div>

      {/* Save-as-standalone CTA. Surfaces only after a real prompt is
          drafted — there's no value in promoting a 3-character stub. */}
      <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            Inline agents only live inside this workflow. Promote to a
            reusable agent to share across workflows, give it knowledge,
            tools, and analytics.
          </div>
        </div>

        {!showSaveAs ? (
          <button
            type="button"
            onClick={() => {
              setShowSaveAs(true);
              setSaveAsName("");
              setSaveError(null);
            }}
            disabled={!canPromote}
            className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-kiln-orange hover:bg-orange-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              canPromote
                ? "Save this inline config as a reusable standalone agent"
                : "Add at least 20 characters of system prompt first"
            }
          >
            <Save className="h-3 w-3" />
            Save as standalone agent →
          </button>
        ) : (
          <div className="space-y-2 rounded-md border border-orange-500/30 bg-orange-500/5 p-2.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Agent name
            </label>
            <input
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="Lead Qualifier"
              autoFocus
              className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/60"
            />
            {saveError && (
              <p className="text-[11px] text-destructive">{saveError}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveAsStandalone}
                disabled={saving || saveAsName.trim().length < 2}
                className="inline-flex items-center gap-1.5 rounded-md bg-kiln-orange px-2.5 py-1 text-xs font-medium text-white hover:bg-kiln-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-3 w-3" />
                    Save agent
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSaveAs(false);
                  setSaveError(null);
                }}
                disabled={saving}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              The new agent will replace the inline config — your workflow
              will reference it by ID.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Inline form rendered directly inside the agent-node config panel.
 * Lets the operator create a brand-new standalone agent without leaving
 * the workflow editor — the form POSTs to /api/agents, then hands the
 * result back so the parent can register it locally and auto-select it
 * in the dropdown.
 *
 * Intentionally minimal (name + system prompt + model) — the operator
 * can refine the agent under /dashboard/agents/<id> later. The goal is
 * a 30-second create flow, not full agent configuration.
 */
function CreateAgentInlineForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: AgentSummary) => void;
}) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length >= 2 && systemPrompt.trim().length >= 20 && !saving;

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const created = await createAgent({
        name: name.trim(),
        systemPrompt: systemPrompt.trim(),
        llmModel: model.trim() || undefined,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">New agent</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lead Qualifier"
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/60"
        />
      </div>

      <div>
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          System prompt
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          placeholder="You are a sales qualification assistant. Score incoming leads on …"
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/60 resize-none"
        />
      </div>

      <div>
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Model
        </label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="claude-sonnet-4-6"
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/60"
        />
      </div>

      {error && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="inline-flex items-center gap-1.5 rounded-md bg-kiln-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-kiln-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Creating…
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" />
              Create agent
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Tip: you can refine personality, knowledge base and tools later under{" "}
        <em>Agents → {name.trim() || "your new agent"}</em>.
      </p>
    </div>
  );
}
