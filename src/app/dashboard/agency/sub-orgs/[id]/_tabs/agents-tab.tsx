"use client";

/**
 * Agents tab — read-only listing of agents that live in the sub-org's
 * Clerk org. Editing is intentionally NOT inline — agents have a rich
 * builder, so the row's "Open" action delegates to login-as-client +
 * the standard agent detail page.
 */
import { useEffect, useState } from "react";
import { Bot, Loader2, LogIn, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AgentRow = {
  id: string;
  name: string;
  slug: string;
  mode: "CHAT" | "TASK";
  status: "DRAFT" | "LIVE" | "PAUSED";
  llmModel: string;
  lastRunAt: string | null;
  updatedAt: string;
  conversationCount: number;
};

interface AgentsTabProps {
  subOrgId: string;
  subOrgName: string;
  readOnly: boolean;
  onLoginAsClient: () => void;
}

export function AgentsTab({
  subOrgId,
  subOrgName,
  readOnly,
  onLoginAsClient,
}: AgentsTabProps) {
  const [items, setItems] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/agency/sub-orgs/${subOrgId}/agents`);
      if (!cancelled && res.ok) {
        const body = await res.json();
        setItems(body.items || []);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [subOrgId]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-card/60">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
        <Bot className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-foreground">
          No agents in {subOrgName} yet
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Login as the client to spin up the first one.
        </p>
        {!readOnly && (
          <Button
            size="sm"
            className="mt-4"
            onClick={onLoginAsClient}
          >
            <LogIn className="mr-1.5 h-3 w-3" />
            Login as client
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card" data-testid="agents-tab">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {items.length} {items.length === 1 ? "agent" : "agents"}
        </h3>
        {!readOnly && (
          <button
            type="button"
            onClick={onLoginAsClient}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogIn className="h-3 w-3" />
            Open builder
          </button>
        )}
      </div>
      <ul className="divide-y divide-border">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 px-4 py-3 text-xs hover:bg-muted/30 transition-colors"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-kiln-orange/10">
              <Bot className="h-3.5 w-3.5 text-kiln-orange" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {a.name}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {a.mode} · {a.llmModel}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                a.status === "LIVE"
                  ? "bg-green-500/15 text-green-400"
                  : a.status === "DRAFT"
                    ? "bg-muted text-muted-foreground"
                    : "bg-amber-500/15 text-amber-400",
              )}
            >
              {a.status}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
              <MessageCircle className="h-3 w-3" />
              {a.conversationCount}
            </span>
            <span className="w-20 text-right text-muted-foreground shrink-0">
              {a.lastRunAt ? formatRel(a.lastRunAt) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatRel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
