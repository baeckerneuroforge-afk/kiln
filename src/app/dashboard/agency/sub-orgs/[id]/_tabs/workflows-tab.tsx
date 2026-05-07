"use client";

/**
 * Workflows tab — read-only listing of AgentTeams (workflows) scoped
 * to the sub-org with the last 30 days of run stats. The "Open" action
 * routes through login-as-client like the Agents tab.
 */
import { useEffect, useState } from "react";
import { GitBranch, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WorkflowRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  runs30d: number;
  successRate: number | null;
  avgDurationMs: number | null;
  lastRunAt: string | null;
  updatedAt: string;
};

interface WorkflowsTabProps {
  subOrgId: string;
  subOrgName: string;
  readOnly: boolean;
  onLoginAsClient: () => void;
}

export function WorkflowsTab({
  subOrgId,
  subOrgName,
  readOnly,
  onLoginAsClient,
}: WorkflowsTabProps) {
  const [items, setItems] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/agency/sub-orgs/${subOrgId}/workflows`);
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
        <GitBranch className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-foreground">
          No workflows in {subOrgName} yet
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Login as the client to build the first workflow.
        </p>
        {!readOnly && (
          <Button size="sm" className="mt-4" onClick={onLoginAsClient}>
            <LogIn className="mr-1.5 h-3 w-3" />
            Login as client
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card" data-testid="workflows-tab">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {items.length} {items.length === 1 ? "workflow" : "workflows"}
        </h3>
        {!readOnly && (
          <button
            type="button"
            onClick={onLoginAsClient}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogIn className="h-3 w-3" />
            Open editor
          </button>
        )}
      </div>
      <ul className="divide-y divide-border">
        {items.map((w) => (
          <li
            key={w.id}
            className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-3 text-xs hover:bg-muted/30 transition-colors"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
              <GitBranch className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {w.name}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                w.status === "ACTIVE"
                  ? "bg-green-500/15 text-green-400"
                  : w.status === "PAUSED"
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {w.status}
            </span>
            <span className="text-muted-foreground tabular-nums w-20 text-right">
              {w.runs30d} runs
            </span>
            <span
              className={cn(
                "tabular-nums w-14 text-right",
                w.successRate === null
                  ? "text-muted-foreground"
                  : w.successRate >= 90
                    ? "text-green-400"
                    : w.successRate >= 70
                      ? "text-amber-400"
                      : "text-red-400",
              )}
            >
              {w.successRate === null ? "—" : `${w.successRate}%`}
            </span>
            <span className="w-16 text-right text-muted-foreground shrink-0">
              {w.lastRunAt ? formatRel(w.lastRunAt) : "—"}
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
