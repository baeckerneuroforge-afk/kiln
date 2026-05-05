"use client";

import { GettingStartedSection } from "@/components/onboarding-checklist";
import { QuickStartSection, RecentActivityFeed } from "@/components/quick-actions";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState, useCallback } from "react";

// Zeitbasierte Begrüßung
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// One cell of the compact stats stripe. Renders a dim em-dash for zero so
// empty accounts do not look like a wall of "0"s — the data isn't useful
// yet, the cell shouldn't shout about it.
function StatCell({
  label,
  value,
  prefix = "",
  loading,
}: {
  label: string;
  value: number;
  prefix?: string;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <div className="h-6 w-14 animate-pulse rounded bg-muted" />
      ) : value === 0 ? (
        <p className="text-2xl font-semibold tracking-tight text-muted-foreground/60">
          —
        </p>
      ) : (
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {prefix}
          {value.toLocaleString("de-DE")}
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  const [stats, setStats] = useState({
    agents: 0,
    conversations: 0,
    leads: 0,
    estimatedValue: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const [agentsRes, analyticsRes] = await Promise.allSettled([
        fetch("/api/agents"),
        fetch("/api/analytics/overview"),
      ]);

      let agents = 0;
      if (agentsRes.status === "fulfilled" && agentsRes.value.ok) {
        const data = await agentsRes.value.json();
        agents = Array.isArray(data) ? data.length : 0;
      }

      let conversations = 0;
      let leads = 0;
      let estimatedValue = 0;
      if (analyticsRes.status === "fulfilled" && analyticsRes.value.ok) {
        const data = await analyticsRes.value.json();
        conversations = data.conversations ?? 0;
        leads = data.leads ?? 0;
        estimatedValue = data.estimatedValue ?? 0;
      }

      setStats({ agents, conversations, leads, estimatedValue });
    } catch {
      setStatsError("Stats konnten nicht geladen werden.");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const greeting = getGreeting();
  const firstName = user?.firstName;

  return (
    <div className="relative mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-normal text-foreground">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create AI Agents, Websites & Workflows — all in one place.
        </p>
      </div>

      {/* Stats stripe — 4 cells, divided, above the fold. */}
      <div className="mb-8">
        {statsError ? (
          <ErrorState message={statsError} onRetry={fetchStats} compact />
        ) : (
          <div
            className={cn(
              "grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/60 sm:grid-cols-4 sm:divide-y-0"
            )}
          >
            <StatCell label="Agents" value={stats.agents} loading={statsLoading} />
            <StatCell label="Conversations" value={stats.conversations} loading={statsLoading} />
            <StatCell label="Leads" value={stats.leads} loading={statsLoading} />
            <StatCell
              label="Est. Value"
              value={stats.estimatedValue}
              prefix="€"
              loading={statsLoading}
            />
          </div>
        )}
      </div>

      {/* Activation Checklist — hides itself when complete or near-complete. */}
      <div className="mb-8">
        <GettingStartedSection />
      </div>

      {/* Quick Start */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Quick Start
        </h2>
        <QuickStartSection />
      </div>

      {/* Recent Activity */}
      <div className="mt-10">
        <RecentActivityFeed hasAgents={statsLoading ? null : stats.agents > 0} />
      </div>
    </div>
  );
}
