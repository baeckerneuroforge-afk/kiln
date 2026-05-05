"use client";

import { Bot, Globe, Workflow, ArrowRight } from "lucide-react";
import Link from "next/link";
import { GettingStartedSection } from "@/components/onboarding-checklist";
import { QuickStartSection, RecentActivityFeed } from "@/components/quick-actions";
import { SkeletonStat } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState, useCallback, useRef } from "react";

const modules = [
  {
    title: "AI Agent Studio",
    description: "Create intelligent chat agents with custom knowledge bases.",
    icon: Bot,
    href: "/dashboard/agents",
    active: true,
  },
  {
    title: "Site Builder",
    description: "Generate websites and landing pages with natural language.",
    icon: Globe,
    href: "/dashboard/sites",
    active: false,
  },
  {
    title: "Workflows",
    description: "Build multi-agent workflows with a visual editor.",
    icon: Workflow,
    href: "/dashboard/teams",
    active: true,
  },
];

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

      {/* Module Cards */}
      <div className="grid gap-5 md:grid-cols-3">
        {modules.map((mod) => (
          <Link
            key={mod.title}
            href={mod.href}
            className={cn(
              "group relative overflow-hidden rounded-xl border border-border bg-card p-6",
              "transition-all duration-150 ease-out",
              "hover:bg-muted/40 hover:border-foreground/20",
              !mod.active && "opacity-50"
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted group-hover:bg-muted/70 transition-colors">
                <mod.icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
              {!mod.active && (
                <span className="text-xs font-medium text-muted-foreground">
                  Coming Soon
                </span>
              )}
            </div>
            <h2 className="mb-1 text-base font-medium text-foreground">
              {mod.title}
            </h2>
            <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
              {mod.description}
            </p>
            {mod.active && (
              <div className="flex items-center gap-1 text-sm font-medium text-primary transition-colors group-hover:text-primary/80">
                Start
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            )}
          </Link>
        ))}
      </div>

      {/* Quick Start */}
      <div className="mt-10">
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
