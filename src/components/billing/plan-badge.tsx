"use client";

/**
 * Sprint 20 — Plan badge.
 *
 * Small pill rendering the active tier's display name. Used in two
 * places today:
 *   - Sidebar footer (compact mode shows only the dot)
 *   - Settings → Billing header
 *
 * Self-fetches from /api/billing/usage so callers don't need to be
 * server components, but accepts an `initialTier` prop for tests +
 * places where the parent already has the tier in hand.
 *
 * Free tier renders in green (kiln-green) to read as "you're on the
 * starter rung", paid tiers in orange (kiln-orange) to feel premium.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getTierLimits, type TierId } from "@/lib/billing/tier-limits";

export function PlanBadge({
  initialTier,
  compact = false,
  href = "/dashboard/settings/billing",
  className,
}: {
  initialTier?: TierId | string | null;
  compact?: boolean;
  href?: string;
  className?: string;
}) {
  const t = useTranslations("billing");
  const [tier, setTier] = useState<string | null>(initialTier ?? null);

  useEffect(() => {
    if (initialTier !== undefined) return;
    let cancelled = false;
    fetch("/api/billing/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.tier) setTier(data.tier);
      })
      .catch(() => {
        // ignore — leave null so the badge is hidden
      });
    return () => {
      cancelled = true;
    };
  }, [initialTier]);

  if (!tier) return null;

  const isFree = tier === "free";
  const tierConfig = getTierLimits(tier);
  const label =
    tier === "free"
      ? t("freePlan.label")
      : tierConfig.displayName;

  const dot = (
    <span
      className={cn(
        "h-1.5 w-1.5 rounded-full",
        isFree ? "bg-kiln-green" : "bg-kiln-orange",
      )}
      aria-hidden
    />
  );

  if (compact) {
    return (
      <Link
        href={href}
        data-testid="plan-badge-compact"
        title={label}
        aria-label={label}
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-md text-xs transition-colors hover:bg-muted",
          className,
        )}
      >
        {dot}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      data-testid="plan-badge"
      data-tier={tier}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
        isFree
          ? "border-kiln-green/30 bg-kiln-green/5 text-kiln-green hover:bg-kiln-green/10"
          : "border-kiln-orange/30 bg-kiln-orange/5 text-kiln-orange hover:bg-kiln-orange/10",
        className,
      )}
    >
      {dot}
      <span>{label}</span>
    </Link>
  );
}
