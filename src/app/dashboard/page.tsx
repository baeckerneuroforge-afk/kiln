"use client";

import { GettingStartedSection } from "@/components/onboarding-checklist";
import { QuickStartSection, RecentActivityFeed } from "@/components/quick-actions";
import { SkeletonStat } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState, useCallback, useRef } from "react";

// Zeitbasierte Begrüßung
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// CountUp Hook — animiert eine Zahl von 0 zum Zielwert
function useCountUp(target: number, duration = 1500): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) {
      setCurrent(0);
      return;
    }

    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return current;
}

// Stat-Karte mit CountUp
function StatCard({
  label,
  value,
  prefix = "",
}: {
  label: string;
  value: number;
  prefix?: string;
}) {
  const displayed = useCountUp(value);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/80 backdrop-blur-sm px-5 py-5",
        "transition-all duration-300 hover:border-foreground/20"
      )}
    >
      <p className="text-3xl font-semibold tracking-tight text-foreground">
        {prefix}
        {displayed.toLocaleString("de-DE")}
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">{label}</p>
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
      <div className="mb-10">
        <h1 className="font-serif text-3xl font-normal text-foreground">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create AI Agents, Websites & Workflows — all in one place.
        </p>
      </div>

      <div className="mb-10">
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
        <RecentActivityFeed />
      </div>

      {/* Stats */}
      <div className="mt-10">
        {statsLoading ? (
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonStat key={i} />
            ))}
          </div>
        ) : statsError ? (
          <ErrorState message={statsError} onRetry={fetchStats} compact />
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Agents" value={stats.agents} />
            <StatCard label="Conversations" value={stats.conversations} />
            <StatCard label="Leads" value={stats.leads} />
            <StatCard label="Est. Value" value={stats.estimatedValue} prefix="€" />
          </div>
        )}
      </div>
    </div>
  );
}
