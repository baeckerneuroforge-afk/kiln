"use client";

import { useEffect, useState } from "react";
import { Bot, ExternalLink, Loader2 } from "lucide-react";
import { ExpressionInput } from "../expression-input";
import Link from "next/link";

interface AgentSummary {
  id: string;
  name: string;
  slug: string;
  llmModel?: string;
  modelProvider?: string;
  agentMode?: string;
  status?: string;
  _count?: { knowledgeEntries: number };
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
  const selectedAgent = agents.find((a) => a.id === agentId);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.agents || [];
        setAgents(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2">
        <Bot className="h-4 w-4 text-orange-400" />
        <p className="text-xs text-zinc-300">Run an existing AI agent as a workflow step</p>
      </div>

      {/* Agent selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Agent</label>
        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
            <span className="text-xs text-zinc-500">Loading agents...</span>
          </div>
        ) : (
          <select
            value={agentId}
            onChange={(e) => onChange({ ...config, agentId: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60"
          >
            <option value="">Select an agent...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.agentMode === "CHAT" ? "Chat" : "Task"})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Selected agent info */}
      {selectedAgent && (
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-200">{selectedAgent.name}</p>
            <Link
              href={`/dashboard/agents/${selectedAgent.id}`}
              className="inline-flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 transition-colors"
            >
              Edit Agent <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700/50">
              /{selectedAgent.slug}
            </span>
            {selectedAgent.llmModel && (
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700/50">
                {selectedAgent.llmModel}
              </span>
            )}
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700/50">
              {selectedAgent.agentMode === "CHAT" ? "Chat" : "Task"}
            </span>
            {selectedAgent._count?.knowledgeEntries ? (
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20">
                {selectedAgent._count.knowledgeEntries} KB entries
              </span>
            ) : null}
            {selectedAgent.status && (
              <span className={`text-[10px] px-2 py-0.5 rounded border ${
                selectedAgent.status === "LIVE"
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-zinc-700/50 text-zinc-500 border-zinc-600/50"
              }`}>
                {selectedAgent.status}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Custom goal override */}
      <ExpressionInput
        label="Goal Override (optional)"
        value={(config.goalOverride as string) || ""}
        onChange={(v) => onChange({ ...config, goalOverride: v })}
        placeholder="{{ input.task }}"
        multiline
        hint="Override the agent's default goal with a custom one"
      />

      {/* Output fields info */}
      <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-2">Output Fields</p>
        <div className="flex flex-wrap gap-1">
          {["output", "summary", "structuredData", "tokensUsed", "cost"].map((f) => (
            <span key={f} className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700/50">{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
