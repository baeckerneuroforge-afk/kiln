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
  DRAFT: { label: "Entwurf", className: "bg-muted text-muted-foreground" },
  LIVE: { label: "Live", className: "bg-kiln-green/10 text-kiln-green" },
  PAUSED: { label: "Pausiert", className: "bg-kiln-orange/10 text-kiln-orange" },
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAgents(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Agent wirklich löschen?")) return;

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
            Erstelle und verwalte deine AI Agents.
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
              Neuer Agent
            </Button>
          </Link>
        </div>
      </div>

      {agents.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-kiln-orange/10">
            <Bot className="h-8 w-8 text-kiln-orange" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Noch keine Agents
          </h2>
          <p className="mb-6 max-w-sm text-center text-sm text-muted-foreground">
            Beschreibe deinen Agent in natürlicher Sprache — KILN erstellt die
            Konfiguration automatisch.
          </p>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/agents/templates">
              <Button variant="outline">
                <Sparkles className="mr-2 h-4 w-4" />
                Aus Template starten
              </Button>
            </Link>
            <Link href="/dashboard/agents/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Eigenen Agent erstellen
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
                  {agent.description || agent.welcomeMessage || "Keine Beschreibung"}
                </p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {agent._count.conversations} Gespräche
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
            <span className="text-sm font-medium">Neuer Agent</span>
          </Link>
        </div>
      )}
    </div>
  );
}
