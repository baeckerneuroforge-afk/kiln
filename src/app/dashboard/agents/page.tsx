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
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { getModelDef } from "@/lib/ai";

interface AgentWithCount {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "DRAFT" | "LIVE" | "PAUSED";
  agentType?: "PUBLIC" | "INTERNAL";
  agentMode?: "CHAT" | "TASK";
  llmModel?: string;
  welcomeMessage: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { conversations: number; runs?: number };
  avgLeadScore?: number | null;
  agentTeamMembers?: { team: { id: string; name: string } }[];
}

const statusConfig = {
  DRAFT: { label: "Draft", dot: "bg-muted-foreground", className: "bg-muted text-muted-foreground" },
  LIVE: { label: "Live", dot: "bg-kiln-green", className: "bg-kiln-green/10 text-kiln-green" },
  PAUSED: { label: "Paused", dot: "bg-kiln-orange", className: "bg-kiln-orange/10 text-kiln-orange" },
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

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between">
        <div className="skeleton h-10 w-10 rounded-lg" />
        <div className="skeleton h-5 w-14 rounded-full" />
      </div>
      <div className="skeleton mb-2 h-5 w-2/3 rounded" />
      <div className="skeleton mb-4 h-4 w-full rounded" />
      <div className="flex items-center gap-4">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-4 w-16 rounded" />
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
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
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {agents.length > 0 && (
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-3xl text-foreground">
              AI Agent Studio
            </h1>
            <p className="mt-2 text-muted-foreground">
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
        <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 py-12">
          <p className="mb-2 text-sm font-medium text-destructive">
            Error: {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Reload page
          </button>
        </div>
      ) : agents.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-20">
          <div className="relative mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-kiln-orange/10">
              <Bot className="h-10 w-10 text-kiln-orange" />
            </div>
            <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-kiln-orange shadow-lg">
              <Plus className="h-3.5 w-3.5 text-white" />
            </div>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            Create your first agent in 2 minutes
          </h2>
          <p className="mb-8 max-w-md text-center text-sm text-muted-foreground">
            Describe what your agent should do in natural language — KILN generates the
            config, knowledge base, and actions automatically.
          </p>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/agents/templates">
              <Button variant="outline">
                <Sparkles className="mr-2 h-4 w-4" />
                Start from Template
              </Button>
            </Link>
            <Link href="/dashboard/agents/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Custom Agent
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        /* Agent Cards Grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const status = statusConfig[agent.status];
            return (
              <Link
                key={agent.id}
                href={`/dashboard/agents/${agent.id}`}
                className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-all duration-200 card-hover-glow"
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                      agent.agentMode === "TASK" ? "bg-kiln-orange/10 group-hover:bg-kiln-orange/15" : "bg-blue-500/10 group-hover:bg-blue-500/15"
                    )}>
                      {agent.agentMode === "TASK" ? (
                        <Zap className="h-5 w-5 text-kiln-orange" />
                      ) : (
                        <MessageSquare className="h-5 w-5 text-blue-500" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold w-fit",
                        agent.agentMode === "TASK" ? "bg-kiln-orange/10 text-kiln-orange" : "bg-blue-500/10 text-blue-500"
                      )}>
                        {agent.agentMode === "TASK" ? <><Zap className="h-2.5 w-2.5" />Task</> : <><MessageSquare className="h-2.5 w-2.5" />Chat</>}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {agent.agentType === "INTERNAL" ? (
                          <>
                            <div className="h-2 w-2 rounded-full bg-purple-400" />
                            <span className="text-[11px] font-medium text-purple-400">Internal</span>
                          </>
                        ) : (
                          <>
                            <div className={cn("h-2 w-2 rounded-full", status.dot)} />
                            <span className="text-[11px] font-medium text-muted-foreground">
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
                  <h3 className="font-semibold text-foreground group-hover:text-kiln-orange transition-colors truncate">
                    {agent.name}
                  </h3>
                  {agent.agentTeamMembers?.[0]?.team && (
                    <span className="shrink-0 rounded-full bg-purple-500/10 px-2 py-0.5 text-[9px] font-medium text-purple-400">
                      Team: {agent.agentTeamMembers[0].team.name}
                    </span>
                  )}
                </div>
                <p className="mb-auto text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                  {agent.description || agent.welcomeMessage || "No description"}
                </p>

                {/* Stats Row */}
                <div className="mt-4 flex items-center gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
                  {agent.llmModel && (() => {
                    const modelDef = getModelDef(agent.llmModel!);
                    return modelDef ? (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground/70">{modelDef.shortLabel}</span>
                    ) : null;
                  })()}
                  <div className="flex items-center gap-1">
                    {agent.agentMode === "TASK" ? (
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
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-5 text-muted-foreground transition-all duration-200 hover:border-kiln-orange/30 hover:text-foreground hover:bg-card/50 min-h-[180px]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
              <Plus className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium">New Agent</span>
          </Link>
        </div>
      )}
    </div>
  );
}
