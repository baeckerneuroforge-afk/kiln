"use client";

import Link from "next/link";
import { GettingStartedSection } from "@/components/onboarding-checklist";
import { QuickStartSection, RecentActivityFeed } from "@/components/quick-actions";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";
import { SubOrgDashboard } from "@/components/dashboard/sub-org-dashboard";
import { useOrgMode } from "@/hooks/use-org-mode";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState, useCallback } from "react";

// Plans that get the agency-tier dashboard treatment (MRR + sub-org KPIs
// always visible, even when zero). Mirrors the BUSINESS / AGENCY /
// ENTERPRISE / ADMIN gate used elsewhere; kept inline because this is
// the only client-side place that needs it.
const AGENCY_TIER_PLANS = new Set(["BUSINESS", "AGENCY", "ENTERPRISE", "ADMIN"]);

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
  activeSubscriptions: number;
  activeSubOrgs: number;
  newSubOrgs30d: number;
  setupFees30d: number;
  stripeConnectStatus: "not_onboarded" | "pending" | "active";
};

export default function DashboardPage() {
  const { user } = useUser();
  const orgMode = useOrgMode();
  const [stats, setStats] = useState<StatsState>({
    agents: 0,
    conversations: 0,
    mrr: 0,
    activeSubscriptions: 0,
    activeSubOrgs: 0,
    newSubOrgs30d: 0,
    setupFees30d: 0,
    stripeConnectStatus: "not_onboarded",
  });
  const [plan, setPlan] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      // Fetch overview + plan in parallel. Plan is needed to decide
      // whether the stats stripe stays visible at zero (agency-tier:
      // yes, MRR=0 is informative; PRO/FREE: hide, no sub-org concept).
      const [overviewRes, planRes] = await Promise.allSettled([
        fetch("/api/analytics/overview"),
        fetch("/api/stripe/plan"),
      ]);
      if (overviewRes.status === "fulfilled" && overviewRes.value.ok) {
        const data = await overviewRes.value.json();
        setStats({
          agents: data.agents ?? 0,
          conversations: data.conversations ?? 0,
          mrr: data.mrr ?? 0,
          activeSubscriptions: data.activeSubscriptions ?? 0,
          activeSubOrgs: data.activeSubOrgs ?? 0,
          newSubOrgs30d: data.newSubOrgs30d ?? 0,
          setupFees30d: data.setupFees30d ?? 0,
          stripeConnectStatus: data.stripeConnectStatus ?? "not_onboarded",
        });
      } else {
        throw new Error("Stats fetch failed");
      }
      if (planRes.status === "fulfilled" && planRes.value.ok) {
        const data = await planRes.value.json();
        setPlan(data.plan ?? null);
      }
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

  // Hide-stripe logic differs by plan tier:
  //   - Agency tier (BUSINESS / AGENCY / ENTERPRISE / ADMIN): always show.
  //     MRR=0 with the "Connect Stripe to track revenue" hint is more
  //     valuable than nothing — it surfaces the path forward.
  //   - PRO / FREE: only show when at least one tile has a non-zero
  //     value. They have no sub-org concept; an empty row is just noise.
  const isAgencyTier = plan ? AGENCY_TIER_PLANS.has(plan) : false;
  const allDataZero =
    stats.agents === 0 &&
    stats.conversations === 0 &&
    stats.mrr === 0 &&
    stats.activeSubOrgs === 0;
  const hideStripe =
    !statsLoading && !statsError && allDataZero && !isAgencyTier;

  // Build the MRR tile's sub-line based on Stripe Connect status. Drives
  // the user toward the next concrete action they can take (onboard,
  // resume, or sit tight) rather than just rendering an em-dash.
  const mrrHint = (() => {
    if (stats.mrr > 0) return undefined;
    if (stats.stripeConnectStatus === "not_onboarded") {
      return (
        <Link
          href="/dashboard/agency/billing"
          className="text-kiln-orange transition-colors hover:text-kiln-orange/80"
        >
          Connect Stripe to track revenue →
        </Link>
      );
    }
    if (stats.stripeConnectStatus === "pending") {
      return (
        <Link
          href="/dashboard/agency/billing"
          className="text-kiln-orange transition-colors hover:text-kiln-orange/80"
        >
          Complete Stripe onboarding →
        </Link>
      );
    }
    return "No active subscriptions yet";
  })();

  // Sub-Orgs sub-line: prefer "+N new (30d)" when there's growth to
  // celebrate, otherwise nudge brand-new agency-tier users toward the
  // first sub-org.
  const subOrgsHint =
    stats.newSubOrgs30d > 0
      ? `+${stats.newSubOrgs30d} new (30d)`
      : stats.activeSubOrgs === 0 && isAgencyTier
      ? (
          <Link
            href="/dashboard/agency/sub-orgs"
            className="text-kiln-orange transition-colors hover:text-kiln-orange/80"
          >
            Create your first →
          </Link>
        )
      : undefined;

  if (orgMode === "SUB_ORG") {
    return <SubOrgDashboard />;
  }

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
          Agency-tier callers see the revenue-flavored row unconditionally
          (MRR / Active Subs / Sub-Orgs / Setup Fees). PRO/FREE callers
          see the agent-flavored row (Agents / Conversations) and only
          when at least one tile has data. */}
      {statsError ? (
        <div className="mb-8">
          <ErrorState message={statsError} onRetry={fetchStats} compact />
        </div>
      ) : hideStripe ? null : (
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
              hint={mrrHint}
            />
            {isAgencyTier ? (
              <>
                <StatCell
                  label="Active Subs"
                  display={
                    stats.activeSubscriptions === 0
                      ? null
                      : stats.activeSubscriptions.toLocaleString("de-DE")
                  }
                  loading={statsLoading}
                />
                <StatCell
                  label="Sub-Orgs"
                  display={
                    stats.activeSubOrgs === 0
                      ? null
                      : stats.activeSubOrgs.toLocaleString("de-DE")
                  }
                  loading={statsLoading}
                  hint={subOrgsHint}
                />
                <StatCell
                  label="Setup Fees (30d)"
                  display={
                    stats.setupFees30d === 0
                      ? null
                      : formatEuros(stats.setupFees30d)
                  }
                  loading={statsLoading}
                  hint={
                    stats.setupFees30d === 0 &&
                    stats.stripeConnectStatus === "active"
                      ? "(last 30 days)"
                      : undefined
                  }
                />
              </>
            ) : (
              <>
                <StatCell
                  label="Active Sub-Orgs"
                  display={
                    stats.activeSubOrgs === 0
                      ? null
                      : stats.activeSubOrgs.toLocaleString("de-DE")
                  }
                  loading={statsLoading}
                  hint={subOrgsHint}
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
              </>
            )}
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
