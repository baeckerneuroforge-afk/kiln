"use client";

/**
 * Sprint 20 — Usage progress bar.
 *
 * Renders a single labeled progress row:
 *   "Conversations this month     73 of 100"
 *   [══════════════════════······]  73%
 *
 * The bar color advances with usage:
 *   < 80%  → kiln-orange (neutral)
 *   80–94% → amber (warning)
 *   ≥ 95%  → kiln-ember (critical)
 *
 * Unlimited tiers (limit >= UNLIMITED) render "Unlimited" instead of
 * the bar. Storage uses "notTracked" until we wire the Supabase
 * byte-sum (flagged in usage-tracker.ts).
 */

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { UNLIMITED } from "@/lib/billing/tier-limits";

export interface UsageProgressProps {
  resource:
    | "monthlyConversations"
    | "maxAgents"
    | "maxSubOrgs"
    | "maxOAuthConnections"
    | "maxStorageBytes";
  current: number;
  limit: number;
  /**
   * Set true for storage until we wire byte-sums; renders
   * "Coming soon" instead of a progress bar.
   */
  notTracked?: boolean;
  className?: string;
}

export function UsageProgress({
  resource,
  current,
  limit,
  notTracked = false,
  className,
}: UsageProgressProps) {
  const t = useTranslations("billing");
  const limitLabel = t(`limits.${resource}`);

  if (notTracked) {
    return (
      <div className={cn("space-y-1.5", className)} data-testid={`usage-${resource}`}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{limitLabel}</span>
          <span className="text-muted-foreground/60 italic">
            {t("usageProgress.notTracked")}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted" />
      </div>
    );
  }

  const isUnlimited = limit >= UNLIMITED;
  if (isUnlimited) {
    return (
      <div className={cn("space-y-1.5", className)} data-testid={`usage-${resource}`}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{limitLabel}</span>
          <span className="font-medium text-foreground">
            {t("usageProgress.unlimited")}
          </span>
        </div>
        <div
          className="h-1.5 rounded-full bg-gradient-to-r from-kiln-orange/30 via-kiln-orange/50 to-kiln-orange/30"
          aria-hidden
        />
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, Math.round((current / Math.max(1, limit)) * 100)));
  const tone =
    pct >= 95
      ? "bg-kiln-ember"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-kiln-orange";

  return (
    <div
      className={cn("space-y-1.5", className)}
      data-testid={`usage-${resource}`}
      data-percentage={pct}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{limitLabel}</span>
        <span className="font-medium text-foreground">
          {t("usageProgress.ofLimit", { current, limit })}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={limitLabel}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-300", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
