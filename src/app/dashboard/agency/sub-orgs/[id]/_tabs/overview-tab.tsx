"use client";

/**
 * Overview tab — KPI cards + recent activity feed for a sub-org.
 * Stats are loaded once on mount; activity uses the dedicated endpoint
 * with a small limit. The tab is intentionally read-only — power
 * actions (invite, archive, login-as-client) live in the top bar.
 */
import { useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  Bot,
  CreditCard,
  GitBranch,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubOrgMeta } from "../page";

type Stats = {
  activeAgents: number;
  totalAgents: number;
  activeWorkflows: number;
  totalWorkflows: number;
  conversations30d: number;
  lastActivityAt: string | null;
  mrrCents: number;
  mrrCurrency: string;
  subscriptionStatus: string | null;
};

type ActivityItem = {
  id: string;
  category: string;
  action: string;
  resourceType: string | null;
  severity: string;
  createdAt: string;
};

interface OverviewTabProps {
  subOrgId: string;
  meta: SubOrgMeta;
  onJumpTab: (
    tab:
      | "agents"
      | "workflows"
      | "members"
      | "pricing"
      | "branding"
      | "activity",
  ) => void;
}

export function OverviewTab({ subOrgId, meta, onJumpTab }: OverviewTabProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [statsRes, activityRes] = await Promise.allSettled([
        fetch(`/api/agency/sub-orgs/${subOrgId}/stats`),
        fetch(`/api/agency/sub-orgs/${subOrgId}/activity?limit=10`),
      ]);
      if (cancelled) return;
      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        setStats(await statsRes.value.json());
      }
      if (activityRes.status === "fulfilled" && activityRes.value.ok) {
        const body = await activityRes.value.json();
        setActivity(body.items || []);
      }
      setLoading(false);
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

  const lastActivityRel = formatRelative(stats?.lastActivityAt);

  return (
    <div className="space-y-5" data-testid="overview-tab">
      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Bot className="h-4 w-4 text-kiln-orange" />}
          label="Active agents"
          value={stats?.activeAgents ?? 0}
          sub={`${stats?.totalAgents ?? 0} total`}
          onClick={() => onJumpTab("agents")}
        />
        <KpiCard
          icon={<GitBranch className="h-4 w-4 text-blue-400" />}
          label="Active workflows"
          value={stats?.activeWorkflows ?? 0}
          sub={`${stats?.totalWorkflows ?? 0} total`}
          onClick={() => onJumpTab("workflows")}
        />
        <KpiCard
          icon={<MessageCircle className="h-4 w-4 text-violet-400" />}
          label="Conversations (30d)"
          value={stats?.conversations30d ?? 0}
        />
        <KpiCard
          icon={<CreditCard className="h-4 w-4 text-green-400" />}
          label="MRR"
          value={
            stats?.mrrCents
              ? formatMoney(stats.mrrCents, stats.mrrCurrency)
              : meta.pricingMode === "FIXED"
                ? "Pending"
                : meta.pricingMode === "CUSTOM"
                  ? "Custom"
                  : "Free"
          }
          sub={
            stats?.subscriptionStatus
              ? stats.subscriptionStatus
              : meta.pricingMode === "FIXED"
                ? "Subscription not yet started"
                : "Open Pricing tab to configure"
          }
          onClick={() => onJumpTab("pricing")}
        />
      </div>

      {/* Last activity strip */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-4 py-2 text-xs text-muted-foreground">
        <ActivityIcon className="h-3.5 w-3.5" />
        <span>Last activity:</span>
        <span className="text-foreground">{lastActivityRel ?? "—"}</span>
      </div>

      {/* Recent activity feed */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </h3>
          <button
            type="button"
            onClick={() => onJumpTab("activity")}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            View all →
          </button>
        </div>
        {activity.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            No activity yet. Things will appear here as agents and workflows
            run.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 px-4 py-2.5 text-xs"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    e.severity === "critical"
                      ? "bg-red-400"
                      : e.severity === "warning"
                        ? "bg-amber-400"
                        : "bg-muted-foreground/60",
                  )}
                />
                <span className="text-muted-foreground capitalize w-20 shrink-0">
                  {e.category}
                </span>
                <span className="text-foreground flex-1 truncate font-mono text-[10px]">
                  {e.action}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {formatRelative(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 text-left transition-colors",
        onClick && "hover:border-foreground/20 hover:bg-card/80 cursor-pointer",
        !onClick && "cursor-default",
      )}
    >
      <div className="flex items-center justify-between">
        {icon}
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground/80">{sub}</div>}
    </button>
  );
}

function formatMoney(cents: number, currency: string): string {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  });
}

function formatRelative(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
