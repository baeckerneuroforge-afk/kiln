"use client";

/**
 * Sprint 19.10 — pricing-page client orchestrator.
 *
 * Single client component because the interactive pieces are the
 * monthly/yearly toggle and (Sprint 20.1.1) the tier-card CTA, which
 * branches by auth state instead of always linking to /sign-up.
 *
 * yearly = monthly × 12 × 0.8 (20% discount), rounded to whole EUR.
 *
 * Sprint 20.1.1 — Tier-CTA flow:
 *   logged out + paid       → router.push("/sign-up?tier=<api>")
 *   logged out + free       → router.push("/sign-up?tier=free")
 *   logged in  + free       → router.push("/dashboard")
 *   logged in  + enterprise → window.location = "mailto:sales@..."
 *   logged in  + paid       → fetch("/api/billing/upgrade") then
 *                              window.location = checkoutUrl
 *
 * The fetch path shows a per-tier loading spinner + an inline error
 * row underneath the cards when Stripe is misconfigured (503 from
 * the upgrade endpoint when STRIPE_PRICE_TIER_X is missing).
 */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { uiTierToApiTier } from "@/lib/billing/tier-limits";

type TierKey = "free" | "starter" | "professional" | "agencyPro" | "enterprise";
type ModuleKey = "voice" | "browser" | "emailOutbound" | "computerUse";
type SupportLevel =
  | "supportCommunity"
  | "supportEmail"
  | "supportPriority"
  | "supportSlack"
  | "supportDedicated";

export interface PricingClientProps {
  tiers: Array<{
    key: TierKey;
    monthly: number | null;
    byok: number | null;
    cta: "startNow" | "startFree" | "contactSales";
    href: string;
    highlighted: boolean;
  }>;
  modules: Array<{ key: ModuleKey; monthly: number }>;
  comparisonRows: Array<{
    key: string;
    free: string;
    starter: string;
    pro: string;
    agencyPro: string;
    enterprise: string;
  }>;
  labels: {
    heroTitle: string;
    heroSubtitle: string;
    monthly: string;
    yearly: string;
    perMonth: string;
    custom: string;
    mostPopular: string;
    startNow: string;
    startFree: string;
    forever: string;
    contactSales: string;
    modulesTitle: string;
    modulesSubtitle: string;
    byokTitle: string;
    byokSubtitle: string;
    byokExplanation: string;
    byokColOriginal: string;
    byokColBYOK: string;
    comparisonTitle: string;
    comparisonSubtitle: string;
    finalCtaTitle: string;
    finalCtaSubtitle: string;
    finalCtaButton: string;
    tierNames: Record<TierKey, string>;
    tierSubtitles: Record<TierKey, string>;
    tierFeatures: Record<TierKey, string[]>;
    moduleNames: Record<ModuleKey, string>;
    moduleDescriptions: Record<ModuleKey, string>;
    comparisonLabels: Record<string, string>;
  };
}

function yearlyMonthly(monthly: number): number {
  return Math.round(monthly * 0.8);
}

const ENTERPRISE_MAILTO = "mailto:sales@kilnbase.com?subject=KILN%20Enterprise";

export function PricingClient({
  tiers,
  modules,
  comparisonRows,
  labels,
}: PricingClientProps) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  // Sprint 20.1.1 — per-tier loading state for the upgrade fetch +
  // a single error slot (only one upgrade can be in flight; clicking
  // a different tier resets the error).
  const [loadingTier, setLoadingTier] = useState<TierKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();

  async function handleTierClick(tier: PricingClientProps["tiers"][number]) {
    setError(null);

    // While Clerk is still resolving on first paint, default to the
    // logged-out flow so the click doesn't silently no-op.
    if (!isLoaded || !isSignedIn) {
      if (tier.cta === "contactSales") {
        window.location.href = ENTERPRISE_MAILTO;
        return;
      }
      // tier.href already encodes the canonical /sign-up?tier=<api>
      // — paid tiers use the underscored ids, free uses free.
      router.push(tier.href);
      return;
    }

    // Logged in.
    if (tier.key === "free") {
      // Anyone signed in already has at least free; route to the app.
      router.push("/dashboard");
      return;
    }
    if (tier.cta === "contactSales") {
      window.location.href = ENTERPRISE_MAILTO;
      return;
    }

    // Logged in + paid tier → trigger the Stripe checkout flow.
    const apiTier = uiTierToApiTier(tier.key);
    setLoadingTier(tier.key);
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTier: apiTier }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        // 503 from the upgrade endpoint means STRIPE_PRICE_TIER_<TIER>
        // is missing in Vercel env. Surface a generic message — the
        // raw error mentions Stripe internals we don't want to leak.
        const friendly =
          res.status === 503
            ? "Checkout is temporarily unavailable. Please try again in a moment."
            : payload.error || "Could not start checkout. Please try again.";
        setError(friendly);
        setLoadingTier(null);
        return;
      }
      const data = (await res.json()) as {
        checkoutUrl?: string;
        ok?: boolean;
        tier?: string;
      };
      if (data.checkoutUrl) {
        // Fresh-checkout path — redirect into Stripe Checkout.
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.ok) {
        // In-place tier-change succeeded (existing healthy subscription).
        router.push("/dashboard?upgrade=success");
        router.refresh();
        return;
      }
      setError("Unexpected response from checkout. Please try again.");
      setLoadingTier(null);
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoadingTier(null);
    }
  }

  return (
    <div data-testid="pricing-page">
      <section className="mx-auto max-w-5xl px-6 pb-12 pt-16 text-center">
        <h1 className="font-serif text-4xl tracking-tight text-foreground sm:text-5xl">
          {labels.heroTitle}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
          {labels.heroSubtitle}
        </p>
        <div
          className="mt-8 inline-flex items-center gap-1 rounded-full border border-border bg-card p-1"
          data-testid="billing-toggle"
        >
          {(["monthly", "yearly"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setBilling(mode)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                billing === mode
                  ? "bg-kiln-orange text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              data-testid={`billing-toggle-${mode}`}
            >
              {mode === "monthly" ? labels.monthly : labels.yearly}
            </button>
          ))}
        </div>
      </section>

      <section
        className="mx-auto max-w-6xl px-6"
        data-testid="pricing-tiers"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {tiers.map((tier) => {
            const isCustom = tier.monthly === null;
            // Sprint 20 — Free (monthly=0) renders €0 / forever, no
            // yearly-discount math. Custom tier (monthly=null) renders
            // "Custom". Everything else applies the -20% yearly toggle.
            const isFree = tier.monthly === 0;
            const price = isCustom
              ? null
              : isFree
                ? 0
                : billing === "monthly"
                  ? tier.monthly
                  : yearlyMonthly(tier.monthly!);
            return (
              <div
                key={tier.key}
                data-testid={`pricing-tier-${tier.key}`}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6",
                  tier.highlighted
                    ? "border-kiln-orange bg-kiln-orange/[0.04] shadow-lg shadow-kiln-orange/10"
                    : "border-border bg-card",
                )}
              >
                {tier.highlighted && (
                  <span
                    className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-kiln-orange px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
                    data-testid={`pricing-tier-${tier.key}-badge`}
                  >
                    <Sparkles className="h-3 w-3" />
                    {labels.mostPopular}
                  </span>
                )}
                <p className="text-sm font-medium text-foreground">
                  {labels.tierNames[tier.key]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {labels.tierSubtitles[tier.key]}
                </p>
                <p className="mt-4">
                  {isCustom ? (
                    <span className="font-serif text-3xl text-foreground">
                      {labels.custom}
                    </span>
                  ) : isFree ? (
                    <>
                      <span className="font-serif text-4xl text-foreground">
                        €0
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {labels.forever}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-serif text-4xl text-foreground">
                        €{price}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {labels.perMonth}
                      </span>
                    </>
                  )}
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                  {labels.tierFeatures[tier.key].map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kiln-orange" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => handleTierClick(tier)}
                  disabled={loadingTier !== null}
                  className={cn(
                    "mt-6 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60",
                    tier.highlighted
                      ? "bg-kiln-orange text-white shadow-md shadow-kiln-orange/30 hover:bg-kiln-orange/95"
                      : "border border-border text-foreground hover:border-foreground/40",
                  )}
                  data-testid={`pricing-tier-${tier.key}-cta`}
                  data-loading={loadingTier === tier.key || undefined}
                >
                  {loadingTier === tier.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {tier.cta === "contactSales"
                    ? labels.contactSales
                    : tier.cta === "startFree"
                      ? labels.startFree
                      : labels.startNow}
                  {loadingTier === tier.key ? null : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
        {error ? (
          <div
            role="alert"
            data-testid="pricing-tier-error"
            className="mx-auto mt-6 max-w-md rounded-lg border border-kiln-ember/30 bg-kiln-ember/5 px-4 py-3 text-center text-sm text-kiln-ember"
          >
            {error}
          </div>
        ) : null}
      </section>

      <section
        className="mx-auto mt-20 max-w-6xl px-6"
        data-testid="pricing-modules"
      >
        <header className="mb-8 text-center">
          <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
            {labels.modulesTitle}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {labels.modulesSubtitle}
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((mod) => (
            <div
              key={mod.key}
              className="rounded-xl border border-border bg-card p-5"
              data-testid={`pricing-module-${mod.key}`}
            >
              <p className="text-sm font-medium text-foreground">
                {labels.moduleNames[mod.key]}
              </p>
              <p className="mt-3">
                <span className="font-serif text-xl text-foreground">
                  +€{mod.monthly}
                </span>
                <span className="ml-1 text-xs text-muted-foreground">
                  {labels.perMonth}
                </span>
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {labels.moduleDescriptions[mod.key]}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="mx-auto mt-20 max-w-4xl px-6"
        data-testid="pricing-byok"
      >
        <header className="mb-6 text-center">
          <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
            {labels.byokTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            {labels.byokSubtitle}
          </p>
        </header>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left">&nbsp;</th>
                <th className="px-5 py-3 text-right">
                  {labels.byokColOriginal}
                </th>
                <th className="px-5 py-3 text-right">{labels.byokColBYOK}</th>
              </tr>
            </thead>
            <tbody>
              {tiers
                .filter((t) => t.monthly !== null && t.byok !== null)
                .map((tier) => (
                  <tr
                    key={tier.key}
                    className="border-b border-border last:border-b-0"
                    data-testid={`pricing-byok-row-${tier.key}`}
                  >
                    <td className="px-5 py-3 font-medium text-foreground">
                      {labels.tierNames[tier.key]}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      €{tier.monthly}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-kiln-orange">
                      €{tier.byok}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-center text-xs text-muted-foreground">
          {labels.byokExplanation}
        </p>
      </section>

      <section
        className="mx-auto mt-20 max-w-6xl px-6"
        data-testid="pricing-comparison"
      >
        <header className="mb-8 text-center">
          <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
            {labels.comparisonTitle}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {labels.comparisonSubtitle}
          </p>
        </header>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left">&nbsp;</th>
                  <th className="px-4 py-3 text-center">
                    {labels.tierNames.free}
                  </th>
                  <th className="px-4 py-3 text-center">
                    {labels.tierNames.starter}
                  </th>
                  <th className="px-4 py-3 text-center">
                    {labels.tierNames.professional}
                  </th>
                  <th className="px-4 py-3 text-center">
                    {labels.tierNames.agencyPro}
                  </th>
                  <th className="px-4 py-3 text-center">
                    {labels.tierNames.enterprise}
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-border last:border-b-0"
                    data-testid={`pricing-comparison-row-${row.key}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {labels.comparisonLabels[row.key]}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {resolveCell(row.free, labels)}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {resolveCell(row.starter, labels)}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {resolveCell(row.pro, labels)}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {resolveCell(row.agencyPro, labels)}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {resolveCell(row.enterprise, labels)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        className="mx-auto my-20 max-w-3xl px-6 text-center"
        data-testid="pricing-final-cta"
      >
        <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
          {labels.finalCtaTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          {labels.finalCtaSubtitle}
        </p>
        <Link
          href="/sign-up"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-kiln-orange px-6 py-3 text-sm font-semibold text-white shadow-md shadow-kiln-orange/30 transition-all hover:bg-kiln-orange/95 hover:shadow-lg"
          data-testid="pricing-final-cta-button"
        >
          {labels.finalCtaButton}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}

function resolveCell(
  value: string,
  labels: PricingClientProps["labels"],
): string {
  // Support-level cells are keyed by their i18n token (supportEmail,
  // supportPriority, …) so localization stays consistent.
  const supportKeys = new Set<SupportLevel>([
    "supportCommunity",
    "supportEmail",
    "supportPriority",
    "supportSlack",
    "supportDedicated",
  ]);
  if (supportKeys.has(value as SupportLevel)) {
    return (labels.comparisonLabels[value] ?? value) as string;
  }
  return value;
}
