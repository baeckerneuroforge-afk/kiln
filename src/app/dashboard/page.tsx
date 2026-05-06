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

// One cell of the compact stats stripe. `hint` is an optional sub-line
// rendered under the value — used by the agency tiles to surface "Connect
// Stripe to track revenue", "Create your first" CTAs, etc. Renders a dim
// em-dash when value is null (intentional empty / not-yet-meaningful)
// instead of a 3xl "0".
function StatCell({
  label,
  display,
  loading,
  hint,
}: {
  label: string;
  // Pre-formatted value, or null to render an em-dash. Pre-formatting at
  // the call site lets each tile choose its own number style (locale int,
  // EUR currency, percent, etc.) without StatCell needing to branch.
  display: string | null;
  loading: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <div className="h-6 w-14 animate-pulse rounded bg-muted" />
      ) : display === null ? (
        <p className="text-2xl font-semibold tracking-tight text-muted-foreground/60">
          —
        </p>
      ) : (
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {display}
        </p>
      )}
      {hint && !loading && (
        <div className="text-[11px] leading-tight text-muted-foreground">
          {hint}
        </div>
      )}
    </div>
  );
}

// Format cents → "€1,234" style, dropping cents above €100 to keep the
// tile dense. Below €100 keeps two decimals so €0.50 is still recognizable.
function formatEuros(cents: number): string {
  const euros = cents / 100;
  return euros.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: euros < 100 ? 2 : 0,
    maximumFractionDigits: euros < 100 ? 2 : 0,
  });
}

type StatsState = {
  agents: number;
  conversations: number;
  mrr: number;
  activeSubOrgs: number;
  newSubOrgs30d: number;
  stripeConnectStatus: "not_onboarded" | "pending" | "active";
};

export default function DashboardPage() {
  const { user } = useUser();
  const [stats, setStats] = useState<StatsState>({
    agents: 0,
    conversations: 0,
    mrr: 0,
    activeSubOrgs: 0,
    newSubOrgs30d: 0,
    stripeConnectStatus: "not_onboarded",
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch("/api/analytics/overview");
      if (!res.ok) throw new Error("Stats fetch failed");
      const data = await res.json();
      setStats({
        agents: data.agents ?? 0,
        conversations: data.conversations ?? 0,
        mrr: data.mrr ?? 0,
        activeSubOrgs: data.activeSubOrgs ?? 0,
        newSubOrgs30d: data.newSubOrgs30d ?? 0,
        stripeConnectStatus: data.stripeConnectStatus ?? "not_onboarded",
      });
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

  // Brand-new accounts have nothing meaningful in the stripe — every cell
  // would render as "—". Skip the whole row in that case so the empty-state
  // path on the dashboard is the activation checklist + Quick Start, not
  // four em-dashes pretending to be data.
  const allStatsZero =
    !statsLoading &&
    !statsError &&
    stats.agents === 0 &&
    stats.conversations === 0 &&
    stats.mrr === 0 &&
    stats.activeSubOrgs === 0;

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

      {/* Stats stripe — 4 cells, divided, above the fold.
          Hidden entirely when the account has nothing to show yet. */}
      {statsError ? (
        <div className="mb-8">
          <ErrorState message={statsError} onRetry={fetchStats} compact />
        </div>
      ) : allStatsZero ? null : (
        <div className="mb-8">
          <div
            className={cn(
              "grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/60 sm:grid-cols-4 sm:divide-y-0"
            )}
          >
            <StatCell
              label="MRR"
              display={stats.mrr === 0 ? null : formatEuros(stats.mrr)}
              loading={statsLoading}
            />
            <StatCell
              label="Active Sub-Orgs"
              display={
                stats.activeSubOrgs === 0
                  ? null
                  : stats.activeSubOrgs.toLocaleString("de-DE")
              }
              loading={statsLoading}
              hint={
                stats.newSubOrgs30d > 0
                  ? `+${stats.newSubOrgs30d} new (30d)`
                  : undefined
              }
            />
            <StatCell
              label="Active Agents"
              display={
                stats.agents === 0
                  ? null
                  : stats.agents.toLocaleString("de-DE")
              }
              loading={statsLoading}
            />
            <StatCell
              label="Conversations (30d)"
              display={
                stats.conversations === 0
                  ? null
                  : stats.conversations.toLocaleString("de-DE")
              }
              loading={statsLoading}
            />
          </div>
        </div>
      )}

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
