"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleHelp,
  PartyPopper,
  Rocket,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type OnboardingStep = {
  key: string;
  label: string;
  completed: boolean;
  link: string;
};

type OnboardingStatus = {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  hidden: boolean;
  allComplete: boolean;
};

const emptyStatus: OnboardingStatus = {
  steps: [],
  completedCount: 0,
  totalCount: 6,
  hidden: false,
  allComplete: false,
};

function ProgressCircle({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const ratio = total === 0 ? 0 : completed / total;
  const dashOffset = circumference - ratio * circumference;

  return (
    <div className="relative h-20 w-20">
      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 72 72" aria-hidden="true">
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="6"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="#F97316"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-semibold text-foreground">{completed}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          of {total}
        </span>
      </div>
    </div>
  );
}

function StepRow({ step }: { step: OnboardingStep }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px]",
            step.completed
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 bg-white/[0.04] text-muted-foreground"
          )}
        >
          {step.completed ? <Check className="h-3.5 w-3.5" /> : null}
        </div>
        <span
          className={cn(
            "truncate text-sm",
            step.completed ? "text-muted-foreground line-through" : "text-foreground"
          )}
        >
          {step.label}
        </span>
      </div>
      <Link
        href={step.link}
        className="shrink-0 text-xs font-medium text-kiln-orange transition-colors hover:text-kiln-orange/80"
      >
        Do it →
      </Link>
    </div>
  );
}

function CelebrationBurst() {
  const particles = [
    { top: "6%", left: "10%", color: "bg-kiln-orange" },
    { top: "12%", left: "24%", color: "bg-kiln-ember" },
    { top: "4%", left: "46%", color: "bg-emerald-400" },
    { top: "10%", left: "64%", color: "bg-sky-400" },
    { top: "8%", left: "82%", color: "bg-yellow-300" },
    { top: "24%", left: "16%", color: "bg-white" },
    { top: "20%", left: "72%", color: "bg-pink-400" },
    { top: "30%", left: "54%", color: "bg-kiln-orange" },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((particle, index) => (
        <span
          key={`${particle.left}-${particle.top}`}
          className={cn(
            "absolute h-2 w-2 rounded-sm opacity-80",
            particle.color,
            index % 2 === 0 ? "animate-bounce" : "animate-ping"
          )}
          style={{
            top: particle.top,
            left: particle.left,
            animationDelay: `${index * 90}ms`,
            animationDuration: index % 2 === 0 ? "1.3s" : "1.7s",
            animationIterationCount: 2,
          }}
        />
      ))}
    </div>
  );
}

function useOnboardingStatus(enabled = true) {
  const [status, setStatus] = useState<OnboardingStatus>(emptyStatus);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/user/onboarding-status");
      if (!res.ok) return;
      const data = (await res.json()) as OnboardingStatus;
      setStatus(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh, setStatus };
}

export function OnboardingChecklist() {
  const { status, loading, refresh, setStatus } = useOnboardingStatus(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(status.hidden);
  }, [status.hidden]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refresh();
    }, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const progressLabel = useMemo(
    () => `${status.completedCount} of ${status.totalCount} complete`,
    [status.completedCount, status.totalCount]
  );

  async function updateHidden(nextHidden: boolean) {
    setHidden(nextHidden);
    try {
      const res = await fetch("/api/user/onboarding-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: nextHidden }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as OnboardingStatus;
      setStatus(data);
    } catch {
      // silent
    }
  }

  if (loading) return null;

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => void updateHidden(false)}
        className="fixed bottom-6 left-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-card/90 text-muted-foreground shadow-xl backdrop-blur transition hover:text-foreground"
        aria-label="Re-open onboarding checklist"
      >
        <CircleHelp className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 z-40 w-[340px] max-w-[calc(100vw-2rem)]">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#120E0B]/95 shadow-2xl backdrop-blur">
        {status.allComplete && <CelebrationBurst />}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-start gap-3">
            <ProgressCircle completed={status.completedCount} total={status.totalCount} />
            <div className="pt-1">
              <p className="text-xs uppercase tracking-[0.18em] text-kiln-orange">
                Getting Started
              </p>
              <h3 className="mt-1 text-base font-semibold text-foreground">
                {status.allComplete ? "You're all set!" : "Activation Checklist"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">{progressLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void updateHidden(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
            aria-label="Hide checklist"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status.allComplete ? (
          <div className="space-y-4 px-5 py-5">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2">
                <PartyPopper className="h-4 w-4 text-emerald-300" />
                <p className="text-sm font-semibold text-foreground">Your AI agent is live.</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Nice. The core setup is done. Next up: optimize, orchestrate, and scale.
              </p>
            </div>

            <div className="space-y-2">
              <Link
                href="/dashboard/operations"
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/10 px-3 py-3 text-sm text-foreground transition hover:border-kiln-orange/30 hover:bg-kiln-orange/5"
              >
                <span className="flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-kiln-orange" />
                  Open Operations Dashboard
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/dashboard/teams"
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/10 px-3 py-3 text-sm text-foreground transition hover:border-kiln-orange/30 hover:bg-kiln-orange/5"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-kiln-orange" />
                  Build Agent Teams
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2 px-5 py-5">
            {status.steps.map((step) => (
              <StepRow key={step.key} step={step} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function GettingStartedSection() {
  const { status, loading } = useOnboardingStatus(true);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-card/70 p-6">
        <div className="h-6 w-40 rounded bg-muted" />
        <div className="mt-3 h-4 w-72 rounded bg-muted" />
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {status.allComplete && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-r from-emerald-500/15 to-transparent p-6">
          <CelebrationBurst />
          <div className="relative">
            <div className="flex items-center gap-2">
              <PartyPopper className="h-5 w-5 text-emerald-300" />
              <h3 className="text-lg font-semibold text-foreground">
                Congratulations! Your AI agent is live.
              </h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Here&apos;s what to do next: optimize conversion, connect more systems, and scale with teams.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/dashboard/operations"
                className="inline-flex items-center gap-2 rounded-lg bg-kiln-orange px-4 py-2 text-sm font-medium text-white transition hover:bg-kiln-orange/90"
              >
                Operations Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard/teams"
                className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-white/[0.1] hover:text-white"
              >
                Explore Agent Teams
              </Link>
              <Link
                href="/dashboard/integrations"
                className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-white/[0.1] hover:text-white"
              >
                Add More Integrations
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.06] bg-card/70 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-kiln-orange">Getting Started</p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">Activation Checklist</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Move from setup to first value. Finish the core steps that make an agent actually useful.
            </p>
          </div>
          <ProgressCircle completed={status.completedCount} total={status.totalCount} />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {status.steps.map((step) => (
            <Link
              key={step.key}
              href={step.link}
              className={cn(
                "rounded-2xl border p-4 transition",
                step.completed
                  ? "border-emerald-400/20 bg-emerald-500/10"
                  : "border-white/[0.06] bg-black/10 hover:border-kiln-orange/30 hover:bg-kiln-orange/5"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                      step.completed
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 bg-white/[0.04] text-muted-foreground"
                    )}
                  >
                    {step.completed ? <Check className="h-4 w-4" /> : <Rocket className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <p
                      className={cn(
                        "text-sm font-medium",
                        step.completed ? "text-emerald-100" : "text-foreground"
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {step.completed ? "Completed" : "Open this next step"}
                    </p>
                  </div>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
