"use client";

import { Bot, Globe, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { GettingStartedSection } from "@/components/onboarding-checklist";
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
    color: "from-kiln-orange/20 to-kiln-ember/10",
    iconColor: "text-kiln-orange",
    borderColor: "border-kiln-orange/20",
    hoverBorder: "hover:border-kiln-orange/30",
    hoverShadow: "hover:shadow-kiln-orange/5",
    active: true,
  },
  {
    title: "Site Builder",
    description: "Generate websites and landing pages with natural language.",
    icon: Globe,
    href: "/dashboard/sites",
    color: "from-kiln-blue/20 to-kiln-blue/5",
    iconColor: "text-kiln-blue",
    borderColor: "border-kiln-blue/20",
    hoverBorder: "hover:border-kiln-blue/30",
    hoverShadow: "hover:shadow-kiln-blue/5",
    active: false,
  },
  {
    title: "Workflow Automation",
    description: "Automate workflows with AI-powered automations.",
    icon: Zap,
    href: "/dashboard/flows",
    color: "from-kiln-green/20 to-kiln-green/5",
    iconColor: "text-kiln-green",
    borderColor: "border-kiln-green/20",
    hoverBorder: "hover:border-kiln-green/30",
    hoverShadow: "hover:shadow-kiln-green/5",
    active: false,
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
        "rounded-xl border border-white/5 bg-card/80 backdrop-blur-sm p-4",
        "transition-all duration-300 hover:border-white/10"
      )}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">
        {prefix}
        {displayed.toLocaleString("de-DE")}
      </p>
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
      {/* Subtiler radialer Gradient-Hintergrund */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-kiln-orange/[0.03] blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-[400px] w-[500px] rounded-full bg-kiln-blue/[0.02] blur-[100px]" />
        <div className="absolute left-0 bottom-0 h-[300px] w-[400px] rounded-full bg-kiln-green/[0.02] blur-[100px]" />
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-3xl text-foreground">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Create AI Agents, Websites & Workflows — all in one place.
        </p>
      </div>

      <div className="mb-8">
        <GettingStartedSection />
      </div>

      {/* Module Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {modules.map((mod) => (
          <Link
            key={mod.title}
            href={mod.href}
            className={cn(
              "group relative overflow-hidden rounded-xl border bg-card p-6",
              "transition-all duration-300 ease-out",
              "hover:-translate-y-1 hover:shadow-xl",
              mod.borderColor,
              mod.hoverBorder,
              mod.hoverShadow,
              !mod.active && "opacity-60"
            )}
          >
            {/* Gradient Hintergrund */}
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-br opacity-50",
                mod.color
              )}
            />

            <div className="relative">
              <div className="mb-4 flex items-center justify-between">
                <mod.icon className={cn("h-8 w-8", mod.iconColor)} />
                {!mod.active && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    Coming Soon
                  </span>
                )}
              </div>
              <h2 className="mb-1 text-lg font-semibold text-foreground">
                {mod.title}
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                {mod.description}
              </p>
              {mod.active && (
                <div className="flex items-center gap-1 text-sm font-medium text-primary transition-colors group-hover:text-primary/80">
                  Start
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-8">
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
