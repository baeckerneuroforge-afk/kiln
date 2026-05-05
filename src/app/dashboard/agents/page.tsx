"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Plus,
  MessageSquare,
  Trash2,
  Sparkles,
  Clock,
  TrendingUp,
  Zap,
  Play,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { getModelDef } from "@/lib/ai";
import { AgentStatusBadge } from "@/components/monitoring/agent-status-badge";

interface AgentWithCount {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "DRAFT" | "LIVE" | "PAUSED";
  visibility?: "PUBLIC" | "INTERNAL";
  mode?: "CHAT" | "TASK";
  llmModel?: string;
  welcomeMessage: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { conversations: number; runs?: number };
  avgLeadScore?: number | null;
  agentTeamMembers?: { team: { id: string; name: string } }[];
}

const statusConfig = {
  DRAFT: { label: "Draft", dot: "bg-amber-500", className: "text-gray-500" },
  LIVE: { label: "Live", dot: "bg-green-500", className: "text-gray-500" },
  PAUSED: { label: "Paused", dot: "bg-gray-500", className: "text-gray-500" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function fetchAgents() {
    setLoading(true);
    setError(null);
    fetch("/api/agents")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setAgents(data);
        else throw new Error("Unexpected API response");
      })
      .catch((err) => {
        console.error("Failed to load agents:", err);
        setError(err.message || "Error loading agents");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchAgents();
  }, []);

  async function handleDelete(id: string, name: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this agent?")) return;

    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    setAgents((prev) => prev.filter((a) => a.id !== id));
    toast(`"${name}" deleted`, "info");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="skeleton h-9 w-48 rounded-lg" />
            <div className="skeleton mt-3 h-4 w-64 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="skeleton h-9 w-28 rounded-lg" />
            <div className="skeleton h-9 w-28 rounded-lg" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {agents.length > 0 && (
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-gray-50">
              Agents
            </h1>
            <p className="mt-1.5 text-sm text-gray-300">
              Create and manage your AI Agents.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/agents/templates">
              <Button variant="outline" size="sm">
                <Sparkles className="mr-2 h-4 w-4" />
                Templates
              </Button>
            </Link>
            <Link href="/dashboard/agents/new">
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Agent
              </Button>
            </Link>
          </div>
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={fetchAgents} />
      ) : agents.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-7 w-7 text-muted-foreground" />}
          title="Erstelle deinen ersten AI Agent"
          description="Agents beantworten Fragen, qualifizieren Leads und buchen Termine — rund um die Uhr."
          actionLabel="Agent erstellen"
          actionHref="/dashboard/agents/new"
        />
      ) : (
        /* Agent Cards Grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const status = statusConfig[agent.status];
            return (
              <Link
                key={agent.id}
                href={`/dashboard/agents/${agent.id}`}
                className="group relative flex flex-col rounded-xl border border-[#332f2b] bg-[#242220] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-150 hover:bg-[#2a2826] hover:border-[#3d3935] hover:shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                      agent.mode === "TASK"
                        ? "bg-orange-500/[0.08] group-hover:bg-orange-500/[0.12]"
                        : "bg-blue-500/[0.08] group-hover:bg-blue-500/[0.12]"
                    )}>
                      {agent.mode === "TASK" ? (
                        <Zap className="h-5 w-5 text-orange-300/50 group-hover:text-orange-300/70 transition-colors" />
                      ) : (
                        <MessageSquare className="h-5 w-5 text-blue-300/50 group-hover:text-blue-300/70 transition-colors" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tracking-wide w-fit text-muted-foreground">
                        {agent.mode === "TASK" ? <><Zap className="h-2.5 w-2.5" />Task</> : <><MessageSquare className="h-2.5 w-2.5" />Chat</>}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {agent.visibility === "INTERNAL" ? (
                          <>
                            <div className="h-2 w-2 rounded-full bg-[#7c6f9b]" />
                            <span className="text-[11px] font-medium text-[#7c6f9b]">Internal</span>
                          </>
                        ) : (
                          <>
                            <div className={cn("h-2 w-2 rounded-full", status.dot)} />
                            <span className="text-[11px] font-medium text-gray-500">
                              {status.label}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(agent.id, agent.name, e)}
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Name + Description */}
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-medium text-gray-100 group-hover:text-orange-100 transition-colors truncate">
                    {agent.name}
                  </h3>
                  <AgentStatusBadge agentId={agent.id} />
                  {agent.agentTeamMembers?.[0]?.team && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
                      Team: {agent.agentTeamMembers[0].team.name}
                    </span>
                  )}
                </div>
                <p className="mb-auto text-sm text-gray-300 line-clamp-2 min-h-[2.5rem] leading-relaxed">
                  {agent.description || agent.welcomeMessage || "No description"}
                </p>

                {/* Stats Row */}
                <div className="mt-4 flex items-center gap-3 border-t border-[#332f2b] pt-3 text-xs text-gray-400">
                  {agent.llmModel && (() => {
                    const modelDef = getModelDef(agent.llmModel!);
                    return modelDef ? (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground/70">{modelDef.shortLabel}</span>
                    ) : null;
                  })()}
                  <div className="flex items-center gap-1">
                    {agent.mode === "TASK" ? (
                      <><Play className="h-3 w-3" /><span>{agent._count.runs || 0} runs</span></>
                    ) : (
                      <><MessageSquare className="h-3 w-3" /><span>{agent._count.conversations}</span></>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{timeAgo(agent.updatedAt || agent.createdAt)}</span>
                  </div>
                  {agent.avgLeadScore != null && agent.avgLeadScore > 0 && (
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      <span>{Math.round(agent.avgLeadScore)}</span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}

          {/* New Agent Card */}
          <Link
            href="/dashboard/agents/new"
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#332f2b] bg-[#242220]/30 p-5 text-gray-400 transition-all duration-200 hover:border-orange-500/20 hover:text-gray-200 hover:bg-[#242220]/60 min-h-[180px]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/[0.06] mb-3">
              <Plus className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium">New Agent</span>
          </Link>
        </div>
      )}
    </div>
  );
}
