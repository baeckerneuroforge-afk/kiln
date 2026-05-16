"use client";

/**
 * Sprint 20 — Upgrade modal.
 *
 * Rendered when a limit is reached or a premium feature is gated.
 * Two flavors:
 *
 *   variant="quota"   → "You've reached your X limit. Upgrade to <Y>
 *                       for more headroom." (counter-style resources)
 *   variant="premium" → "X is a premium feature." (boolean-feature
 *                       resources like custom-domain, email-sender)
 *
 * The CTA hits POST /api/billing/upgrade with `{ targetTier:
 * nextTier }`. On success, the API returns either `{ checkoutUrl }`
 * (Stripe Checkout redirect) or `{ ok: true }` (in-place change for
 * existing subscriptions). Both paths close the modal and reload
 * /api/billing/usage state.
 *
 * Open/close is fully controlled by the parent — this component
 * doesn't own visibility state. Consumers usually wire it to a
 * LimitReachedError caught from a mutation handler.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getTierLimits,
  type TierId,
  type LimitCounterKey,
} from "@/lib/billing/tier-limits";

type Resource =
  | LimitCounterKey
  | "customDomain"
  | "emailSender"
  | "moduleAddOns"
  | "removeBranding";

export interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * "quota" for count-based limits (conversations, agents, sub-orgs,
   * oauth, storage); "premium" for boolean-feature gates (custom-domain,
   * email-sender, module-add-ons, remove-branding).
   */
  variant: "quota" | "premium";
  resource: Resource;
  currentTier: TierId | string;
  nextTier: TierId | null;
  /** Required for quota variant; ignored for premium. */
  current?: number;
  limit?: number;
}

export function UpgradeModal({
  open,
  onOpenChange,
  variant,
  resource,
  currentTier,
  nextTier,
  current,
  limit,
}: UpgradeModalProps) {
  const t = useTranslations("billing");
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const resourceLabel = t(`limits.${resource}`);
  const currentTierLabel = getTierLimits(currentTier).displayName;
  const nextTierLabel = nextTier ? getTierLimits(nextTier).displayName : null;

  async function handleUpgrade() {
    if (!nextTier) {
      // No paid tier above — should never happen for premium since
      // every gated feature has a higher tier, but guard anyway.
      router.push("/pricing");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTier: nextTier }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Upgrade failed");
      }
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      // In-place tier change succeeded.
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed");
      setSubmitting(false);
    }
  }

  const title =
    variant === "quota"
      ? t("upgradeModal.title", { resource: resourceLabel })
      : t("upgradeModal.premiumTitle", { resource: resourceLabel });

  const description =
    variant === "quota"
      ? t("upgradeModal.description", {
          current: current ?? 0,
          limit: limit ?? 0,
          tier: currentTierLabel,
          nextTier: nextTierLabel ?? "Enterprise",
        })
      : t("upgradeModal.premiumDescription", {
          resource: resourceLabel,
          nextTier: nextTierLabel ?? "Enterprise",
        });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      data-testid="upgrade-modal"
      data-variant={variant}
      data-resource={resource}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !submitting && onOpenChange(false)}
      />
      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={() => !submitting && onOpenChange(false)}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h2
          id="upgrade-modal-title"
          className="font-serif text-xl text-foreground"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>

        {error && (
          <div
            role="alert"
            data-testid="upgrade-modal-error"
            className={cn(
              "mt-4 rounded-lg border border-kiln-ember/30 bg-kiln-ember/5 px-3 py-2 text-xs text-kiln-ember",
            )}
          >
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Button
            onClick={handleUpgrade}
            disabled={submitting || !nextTier}
            data-testid="upgrade-modal-cta-upgrade"
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("upgradeModal.ctaUpgrade", {
                  nextTier: nextTierLabel ?? "Enterprise",
                })}
              </>
            ) : (
              <>
                {t("upgradeModal.ctaUpgrade", {
                  nextTier: nextTierLabel ?? "Enterprise",
                })}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          <Link
            href="/pricing"
            data-testid="upgrade-modal-cta-see-all"
            className="text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("upgradeModal.ctaSeeAllPlans")}
          </Link>
          <button
            type="button"
            onClick={() => !submitting && onOpenChange(false)}
            data-testid="upgrade-modal-cta-cancel"
            className="text-center text-xs text-muted-foreground/70 transition-colors hover:text-muted-foreground"
          >
            {t("upgradeModal.ctaCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
