"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bot,
  Sparkles,
  Plug,
  ArrowRight,
  MessageSquare,
  Zap,
  Play,
  Plus,
  Download,
  Copy,
  GitBranch,
  Compass,
  Rocket,
  Code2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── 1. QuickStartSection ───────────────────────────────────────────────────

const quickStartCards = [
  {
    title: "Create an Agent",
    description: "Build an AI agent for your website in minutes",
    href: "/dashboard/agents/new",
    icon: Bot,
  },
  {
    title: "Deploy a Workflow",
    description: "Choose from pre-built workflow templates",
    href: "/dashboard/workflows/templates",
    icon: Sparkles,
  },
  {
    title: "Connect Integration",
    description: "Connect your tools and services",
    href: "/dashboard/integrations",
    icon: Plug,
  },
] as const;

export function QuickStartSection() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {quickStartCards.map((card) => {
        const Icon = card.icon;
        return (
          <Link
            key={card.title}
            href={card.href}
            className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-all duration-150 hover:bg-muted/40 hover:border-foreground/20"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted group-hover:bg-muted/70 transition-colors">
              <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                {card.title}
              </h3>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {card.description}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

// ─── 2. RecentActivityFeed ──────────────────────────────────────────────────

interface ActivityEvent {
  id: string;
  type: "agent" | "workflow" | "conversation";
  title: string;
  timestamp: string;
  href: string;
}

const activityIcons: Record<ActivityEvent["type"], React.ElementType> = {
  agent: Bot,
  workflow: Zap,
  conversation: MessageSquare,
};

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60)
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecentActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActivity() {
      try {
        const res = await fetch("/api/activity/recent");
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events ?? []);
        }
      } catch {
        // Silently handle — empty state will show
      } finally {
        setLoading(false);
      }
    }
    fetchActivity();
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-medium text-foreground">Recent Activity</h3>
      </div>

      {loading ? (
        <ActivitySkeleton />
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
          <Bot className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No recent activity yet. Create your first agent to get started.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {events.slice(0, 5).map((event) => {
            const Icon = activityIcons[event.type];
            return (
              <li key={event.id}>
                <Link
                  href={event.href}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {event.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {relativeTime(event.timestamp)}
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── 3. AgentQuickActions ───────────────────────────────────────────────────

const agentActions = [
  { label: "Test", icon: Eye, action: "scroll" as const },
  { label: "Embed", icon: Code2, action: "link" as const },
  { label: "Add to Workflow", icon: GitBranch, action: "link" as const },
  { label: "Conversations", icon: MessageSquare, action: "link" as const },
];

export function AgentQuickActions({
  agentId,
}: {
  agentId: string;
  agentName?: string;
}) {
  function getHref(label: string) {
    switch (label) {
      case "Embed":
        return `/dashboard/agents/${agentId}?tab=embed`;
      case "Add to Workflow":
        return `/dashboard/teams/new?agentId=${agentId}`;
      case "Conversations":
        return `/dashboard/conversations?agentId=${agentId}`;
      default:
        return "#";
    }
  }

  function handleClick(label: string) {
    if (label === "Test") {
      const preview = document.getElementById("preview");
      if (preview) {
        preview.scrollIntoView({ behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {agentActions.map(({ label, icon: Icon, action }) => {
        const shared = cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground",
          "transition-colors hover:border-foreground/20 hover:text-foreground"
        );

        if (action === "scroll") {
          return (
            <button
              key={label}
              type="button"
              onClick={() => handleClick(label)}
              className={shared}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        }

        return (
          <Link key={label} href={getHref(label)} className={shared}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── 4. WorkflowQuickActions ────────────────────────────────────────────────

export function WorkflowQuickActions({
  onRunNow,
  onAddNode,
  onExportYaml,
  onClone,
}: {
  teamId?: string;
  onRunNow?: () => void;
  onAddNode?: () => void;
  onExportYaml?: () => void;
  onClone?: () => void;
}) {
  const actions = [
    { label: "Run Now", icon: Play, handler: onRunNow },
    { label: "Add Node", icon: Plus, handler: onAddNode },
    { label: "Export YAML", icon: Download, handler: onExportYaml },
    { label: "Clone", icon: Copy, handler: onClone },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map(({ label, icon: Icon, handler }) => (
        <button
          key={label}
          type="button"
          onClick={handler}
          disabled={!handler}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground",
            "transition-colors hover:border-foreground/20 hover:text-foreground",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── 5. WelcomeExperience ───────────────────────────────────────────────────

const pathCards = [
  {
    title: "A chatbot for my website",
    description:
      "Create an AI agent that handles conversations, captures leads, and books appointments",
    href: "/dashboard/agents/new",
    icon: MessageSquare,
  },
  {
    title: "An automated workflow",
    description:
      "Deploy a multi-agent workflow that automates your business processes",
    href: "/dashboard/workflows/templates",
    icon: GitBranch,
  },
  {
    title: "I want to explore",
    description:
      "Browse templates, see what's possible, and find inspiration",
    href: "/dashboard/agents/templates",
    icon: Compass,
  },
] as const;

export function WelcomeExperience() {
  return (
    <div className="space-y-6">
      {/* Hauptkarte */}
      <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent p-8">
        <h2 className="font-serif text-2xl text-foreground">Welcome to KILN</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What do you want to build?
        </p>

        {/* Pfad-Karten */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pathCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.title}
                href={card.href}
                className={cn(
                  "group flex flex-col gap-3 rounded-xl border border-border bg-card p-5",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg"
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">
                      {card.title}
                    </h3>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Featured Template */}
        <div className="mt-6 flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
              <Rocket className="h-4.5 w-4.5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Most Popular: Sales Pipeline
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Qualify leads, score them, and route to the right agent — all
                automated
              </p>
            </div>
          </div>
          <Link href="/dashboard/teams/new?template=sales-pipeline">
            <Button
              size="sm"
              className="bg-orange-600 text-white hover:bg-orange-500"
            >
              <Rocket className="mr-1.5 h-3.5 w-3.5" />
              Deploy in 30 seconds
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
