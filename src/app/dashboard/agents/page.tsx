"use client";

import { useEffect, useState } from "react";
import { Bot, Plus, MessageSquare, Trash2, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AgentWithCount {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "DRAFT" | "LIVE" | "PAUSED";
  welcomeMessage: string | null;
  createdAt: string;
  _count: { conversations: number };
}

const statusConfig = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  LIVE: { label: "Live", className: "bg-kiln-green/10 text-kiln-green" },
  PAUSED: { label: "Paused", className: "bg-kiln-orange/10 text-kiln-orange" },
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this agent?")) return;

    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    setAgents((prev) => prev.filter((a) => a.id !== id));
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
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
            <Button variant="outline">
              <Sparkles className="mr-2 h-4 w-4" />
              Templates
            </Button>
          </Link>
          <Link href="/dashboard/agents/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Agent
            </Button>
          </Link>
        </div>
      </div>

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
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-kiln-orange/10">
            <Bot className="h-8 w-8 text-kiln-orange" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            No Agents Yet
          </h2>
          <p className="mb-6 max-w-sm text-center text-sm text-muted-foreground">
            Describe your agent in natural language — KILN generates the
            config automatically.
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const status = statusConfig[agent.status];
            return (
              <Link
                key={agent.id}
                href={`/dashboard/agents/${agent.id}`}
                className="group relative rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-lg"
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kiln-orange/10">
                    <Bot className="h-5 w-5 text-kiln-orange" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px] font-medium", status.className)}
                    >
                      {status.label}
                    </Badge>
                    <button
                      onClick={(e) => handleDelete(agent.id, e)}
                      className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Name + Description */}
                <h3 className="mb-1 font-semibold text-foreground">
                  {agent.name}
                </h3>
                <p className="mb-4 text-xs text-muted-foreground line-clamp-2">
                  {agent.description || agent.welcomeMessage || "No description"}
                </p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {agent._count.conversations} Conversations
                  </div>
                </div>
              </Link>
            );
          })}

          {/* New Agent Card */}
          <Link
            href="/dashboard/agents/new"
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-5 text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
          >
            <Plus className="mb-2 h-8 w-8" />
            <span className="text-sm font-medium">New Agent</span>
          </Link>
        </div>
      )}
    </div>
  );
}
