"use client";

/**
 * Sprint 20 — Dashboard welcome banner for Free users.
 *
 * Self-fetches the active tier from /api/billing/usage on mount, so
 * the consumer doesn't need to be a server component. Renders nothing
 * when the active tier isn't "free" or when the user already
 * dismissed the banner in this browser (localStorage flag — no DB
 * roundtrip needed for this UX nudge).
 *
 * Drop into any client tree:
 *   <FreePlanWelcomeBanner />
 *
 * For tests / Storybook / SSR-rendered server pages, the parent can
 * skip the fetch by passing `initialTier` directly:
 *   <FreePlanWelcomeBanner initialTier="free" />
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { TierId } from "@/lib/billing/tier-limits";

const STORAGE_KEY = "kiln_free_welcome_dismissed_v1";

export function FreePlanWelcomeBanner({
  initialTier,
}: {
  initialTier?: TierId | string | null;
} = {}) {
  const t = useTranslations("billing.freePlan");
  const [tier, setTier] = useState<string | null>(initialTier ?? null);
  const [dismissed, setDismissed] = useState(true); // hidden until hydrated

  useEffect(() => {
    // Hydrate dismiss flag from localStorage.
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }

    // Skip the fetch when a parent already supplied the tier.
    if (initialTier !== undefined) return;

    let cancelled = false;
    fetch("/api/billing/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.tier) setTier(data.tier);
      })
      .catch(() => {
        // Network error / unauthorized — stay null, banner won't render.
      });
    return () => {
      cancelled = true;
    };
  }, [initialTier]);

  if (tier !== "free") return null;
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore — state already toggled
    }
  }

  return (
    <div
      data-testid="free-plan-welcome-banner"
      className="relative mb-6 rounded-xl border border-kiln-green/25 bg-gradient-to-br from-kiln-green/5 to-transparent p-4 pr-12"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("welcomeBannerDismiss")}
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-kiln-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-kiln-green">
          {t("label")}
        </span>
      </div>
      <h3 className="mt-2 font-serif text-base text-foreground">
        {t("welcomeBannerTitle")}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("welcomeBannerSubtitle")}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Link
          href="/pricing"
          className="text-xs font-medium text-kiln-orange transition-colors hover:text-kiln-orange/80"
        >
          {t("welcomeBannerCta")} →
        </Link>
      </div>
    </div>
  );
}
