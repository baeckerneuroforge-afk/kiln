"use client";

/**
 * Sprint 20.1.1 — Stripe Checkout return-handler.
 *
 * The /api/billing/upgrade route sets Stripe Checkout's success_url
 * + cancel_url to `/dashboard?upgrade=success&tier=<X>` and
 * `/dashboard?upgrade=cancelled`. This component runs on the
 * dashboard, reads those params, fires a toast, and immediately
 * clears the params so a browser refresh doesn't re-fire the toast.
 *
 * Renders null when neither param is present — safe to mount
 * unconditionally in the dashboard layout.
 *
 * `success` is reactive to the actual upgrade outcome:
 *   - Stripe webhook flips AgencyPlatformSubscription.status to "active"
 *     asynchronously, so the toast says "thanks" rather than asserting
 *     the new tier is live (the next /api/billing/usage poll will pick
 *     it up).
 *   - The tier param is purely informational, used for the success copy.
 *
 * `cancelled` is purely the user's choice ("I clicked X on Stripe");
 * no DB state changes happen on cancel.
 */

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast";
import { getTierLimits } from "@/lib/billing/tier-limits";

export function UpgradeResultToast() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("billing.upgradeResult");
  const { toast } = useToast();

  useEffect(() => {
    const result = params.get("upgrade");
    if (result !== "success" && result !== "cancelled") return;

    if (result === "success") {
      const rawTier = params.get("tier");
      const tierName = rawTier ? getTierLimits(rawTier).displayName : "";
      toast(t("success", { tier: tierName }), "success");
    } else {
      toast(t("cancelled"), "info");
    }

    // Clear the params so a refresh doesn't re-fire — keep other
    // params if present (none today, but futureproofs the dashboard).
    const next = new URLSearchParams(params.toString());
    next.delete("upgrade");
    next.delete("tier");
    const queryString = next.toString();
    router.replace(queryString ? `/dashboard?${queryString}` : "/dashboard");
    // params is stable per render; the effect should fire once per
    // mount-with-params. Linter exception: t + toast + router are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return null;
}
