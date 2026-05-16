"use client";

/**
 * Sprint 20 — Dashboard banner that surfaces a tier-limit warning.
 *
 * Reads from /api/billing/usage and shows a banner when:
 *   - conversations percentage ≥ 80%
 *   - OR agents/sub-orgs/oauth percentage ≥ 95% (state counters)
 *
 * Three tones:
 *   80–94%  → amber, "approaching" copy
 *   95–99%  → kiln-ember, "almost at limit" copy
 *   ≥ 100%  → kiln-ember, "limit reached" + upgrade CTA primary
 *
 * Dismissible per-period — the next month's fresh counter starts the
 * banner over again. Dismissal is in-memory only (state), so the
 * banner returns on next page load if still over the threshold.
 *
 * Wire-up: render `<TierLimitBanner />` in the dashboard layout above
 * the FreePlanWelcomeBanner. Renders null until usage data arrives.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, X, AlertTriangle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type TierId,
  type LimitCounterKey,
  type TierLimits,
} from "@/lib/billing/tier-limits";
import { UpgradeModal } from "@/components/billing/upgrade-modal";

interface UsageResponse {
  tier: TierId;
  limits: TierLimits;
  usage: {
    conversationsCount: number;
    agentsCount: number;
    subOrgsCount: number;
    oauthConnectionsCount: number;
  };
  nextTier: TierId | null;
  percentages: {
    conversations: number;
    agents: number;
    subOrgs: number;
    oauth: number;
  };
}

interface WarningPick {
  resource: LimitCounterKey;
  percentage: number;
  current: number;
  limit: number;
}

const RESOURCE_KEYS: Array<{
  key: keyof UsageResponse["percentages"];
  resource: LimitCounterKey;
  currentField: keyof UsageResponse["usage"];
  limitField: keyof TierLimits;
}> = [
  {
    key: "conversations",
    resource: "monthlyConversations",
    currentField: "conversationsCount",
    limitField: "monthlyConversations",
  },
  {
    key: "agents",
    resource: "maxAgents",
    currentField: "agentsCount",
    limitField: "maxAgents",
  },
  {
    key: "subOrgs",
    resource: "maxSubOrgs",
    currentField: "subOrgsCount",
    limitField: "maxSubOrgs",
  },
  {
    key: "oauth",
    resource: "maxOAuthConnections",
    currentField: "oauthConnectionsCount",
    limitField: "maxOAuthConnections",
  },
];

/**
 * Picks the resource with the highest percentage when any has
 * crossed the 80% threshold. Returns null if everything is under 80%.
 */
function pickHighestWarning(data: UsageResponse): WarningPick | null {
  let highest: WarningPick | null = null;
  for (const cfg of RESOURCE_KEYS) {
    const pct = data.percentages[cfg.key] ?? 0;
    if (pct < 80) continue;
    const current = data.usage[cfg.currentField];
    const limit = data.limits[cfg.limitField] as number;
    if (!highest || pct > highest.percentage) {
      highest = { resource: cfg.resource, percentage: pct, current, limit };
    }
  }
  return highest;
}

export function TierLimitBanner({
  initialData,
}: {
  initialData?: UsageResponse | null;
} = {}) {
  const t = useTranslations("billing");
  const [data, setData] = useState<UsageResponse | null>(initialData ?? null);
  const [dismissed, setDismissed] = useState(false);
  // Sprint 20.1.1 — clicking the CTA opens the in-app UpgradeModal
  // instead of forwarding to /pricing. The modal POSTs
  // /api/billing/upgrade directly so the user never has to find
  // their tier card again.
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (initialData !== undefined) return;
    let cancelled = false;
    fetch("/api/billing/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!cancelled && payload) setData(payload as UsageResponse);
      })
      .catch(() => {
        // ignore — banner stays hidden
      });
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  if (!data) return null;
  if (dismissed) return null;

  const warning = pickHighestWarning(data);
  if (!warning) return null;

  const isCritical = warning.percentage >= 100;
  const isAlmost = warning.percentage >= 95 && warning.percentage < 100;
  const tone = isCritical
    ? "border-kiln-ember/40 bg-kiln-ember/10 text-kiln-ember"
    : isAlmost
      ? "border-kiln-ember/30 bg-kiln-ember/5 text-kiln-ember"
      : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-500";

  const Icon = isCritical || isAlmost ? AlertOctagon : AlertTriangle;
  const resourceLabel = t(`limits.${warning.resource}`);
  const nextTier = data.nextTier;

  const titleKey = isCritical
    ? "notifications.reached100.title"
    : isAlmost
      ? "notifications.approaching95.title"
      : "notifications.approaching80.title";
  const bodyKey = isCritical
    ? "notifications.reached100.body"
    : isAlmost
      ? "notifications.approaching95.body"
      : "notifications.approaching80.body";

  return (
    <div
      role={isCritical ? "alert" : "status"}
      data-testid="tier-limit-banner"
      data-percentage={warning.percentage}
      data-resource={warning.resource}
      className={cn(
        "relative mb-4 flex items-start gap-3 rounded-xl border p-4 pr-12",
        tone,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-medium">
          {t(titleKey, { resource: resourceLabel })}
        </p>
        <p className="mt-1 text-xs opacity-90">
          {t(bodyKey, {
            current: warning.current,
            limit: warning.limit,
            resource: resourceLabel,
            tier: data.tier,
            nextTier: nextTier ?? "Enterprise",
          })}
        </p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          data-testid="tier-limit-banner-cta"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
        >
          {t("freePlan.upgradeCta")}
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
      <UpgradeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        variant="quota"
        resource={warning.resource}
        currentTier={data.tier}
        nextTier={nextTier}
        current={warning.current}
        limit={warning.limit}
      />
    </div>
  );
}
