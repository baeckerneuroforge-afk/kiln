"use client";

/**
 * Sprint 20.1.1 — Post-sign-up checkout trigger.
 *
 * Self-fetches /api/billing/pending-tier on mount — that endpoint
 * reads the kiln-pending-tier cookie (set by /sign-up when a
 * logged-out visitor arrived from the pricing-page) AND clears it
 * server-side in the same response, so a refresh during the redirect
 * doesn't fire a second Stripe Checkout session.
 *
 * On a non-null tier:
 *   1. POST /api/billing/upgrade with the resolved tier
 *   2. Stripe responds with { checkoutUrl } → window.location.href
 *      hands the visitor over to Checkout
 *   3. On API failure: render an inline message pointing to
 *      Settings → Billing so the visitor isn't left in limbo
 *
 * Renders null in the steady state (no cookie present) — the
 * dashboard layout can include this unconditionally; it's invisible
 * to existing flows.
 *
 * Tests can bypass the fetch by passing `initialTier`. Tests can also
 * skip the resolve roundtrip by setting `initialTier="none"`.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  isPendingTier,
  type PendingTier,
} from "@/lib/billing/pending-tier";
import { getTierLimits } from "@/lib/billing/tier-limits";

type ResolveState =
  | { status: "resolving" }
  | { status: "redirecting"; tier: PendingTier }
  | { status: "idle" }
  | { status: "error"; tier: PendingTier };

export function PendingTierHandler({
  initialTier,
}: {
  /** Pass "none" to short-circuit the resolve fetch in tests / SSR. */
  initialTier?: PendingTier | "none";
} = {}) {
  const t = useTranslations("billing.pendingTier");
  const [state, setState] = useState<ResolveState>(() => {
    if (initialTier === "none") return { status: "idle" };
    if (initialTier && isPendingTier(initialTier)) {
      return { status: "redirecting", tier: initialTier };
    }
    return { status: "resolving" };
  });

  useEffect(() => {
    // `cancelled` has to be hoisted above the early-return for the
    // "redirecting" branch — otherwise its TDZ is hit when the
    // checkout fetch closure reads it before this point is reached.
    let cancelled = false;

    async function triggerCheckout(tier: PendingTier) {
      try {
        const res = await fetch("/api/billing/upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetTier: tier }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", tier });
          return;
        }
        const data = (await res.json()) as { checkoutUrl?: string };
        if (cancelled) return;
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        setState({ status: "error", tier });
      } catch {
        if (cancelled) return;
        setState({ status: "error", tier });
      }
    }

    if (state.status === "redirecting") {
      // Mounted with a known tier (test path or post-resolve) — kick
      // off the upgrade fetch immediately.
      void triggerCheckout(state.tier);
      return () => {
        cancelled = true;
      };
    }
    if (state.status !== "resolving") return;

    fetch("/api/billing/pending-tier")
      .then((r) => (r.ok ? r.json() : { pendingTier: null }))
      .then((data: { pendingTier?: string | null }) => {
        if (cancelled) return;
        const tier = data.pendingTier;
        if (isPendingTier(tier)) {
          setState({ status: "redirecting", tier });
          void triggerCheckout(tier);
        } else {
          setState({ status: "idle" });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "idle" });
      });

    return () => {
      cancelled = true;
    };
    // initialTier is captured at mount only; subsequent renders use
    // state.status. ESLint flags `t` as a missing dep but next-intl
    // returns a stable reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  if (state.status === "idle" || state.status === "resolving") {
    // Resolving is invisible too — the cookie roundtrip is fast and
    // showing a full-screen spinner during it would flash on every
    // dashboard load for users without a pending tier.
    return null;
  }

  const tierName = getTierLimits(state.tier).displayName;

  return (
    <div
      role="status"
      data-testid="pending-tier-handler"
      data-tier={state.tier}
      data-status={state.status}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-sm"
    >
      <div className="max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        {state.status === "error" ? (
          <>
            <p className="font-serif text-lg text-foreground">{tierName}</p>
            <p
              data-testid="pending-tier-handler-error"
              className="mt-3 text-sm text-kiln-ember"
            >
              {t("redirectError")}
            </p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-kiln-orange" />
            <h2 className="mt-4 font-serif text-lg text-foreground">
              {t("redirectingTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("redirectingSubtitle", { tier: tierName })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
