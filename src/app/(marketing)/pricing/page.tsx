/**
 * Sprint 19.10 — public /pricing page.
 *
 * Server component pulls translations + the static tier/module/BYOK
 * data structure, hands it to a tiny client wrapper for the
 * monthly/yearly toggle. Everything below the toggle is server-rendered
 * for SEO + speed.
 */
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PricingClient } from "@/components/marketing/pricing-client";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pricing");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      type: "website",
    },
  };
}

// Tiers: monthly EUR (with -20% applied to yearly).
// Sprint 20 — "free" is the entry tier. Free=0 → no BYOK row in the
// BYOK table (filtered by `monthly !== null`).
const TIERS = [
  {
    key: "free" as const,
    monthly: 0,
    byok: null,
    cta: "startFree" as const,
    href: "/sign-up?tier=free",
    highlighted: false,
  },
  {
    key: "starter" as const,
    monthly: 97,
    byok: 67,
    cta: "startNow" as const,
    href: "/sign-up?tier=starter",
    highlighted: false,
  },
  {
    key: "professional" as const,
    monthly: 297,
    byok: 197,
    cta: "startNow" as const,
    href: "/sign-up?tier=professional",
    highlighted: true,
  },
  {
    key: "agencyPro" as const,
    monthly: 497,
    byok: 347,
    cta: "startNow" as const,
    href: "/sign-up?tier=agency-pro",
    highlighted: false,
  },
  {
    key: "enterprise" as const,
    monthly: null,
    byok: null,
    cta: "contactSales" as const,
    href: "mailto:sales@kilnbase.com?subject=KILN%20Enterprise",
    highlighted: false,
  },
];

const MODULES = [
  { key: "voice" as const, monthly: 200 },
  { key: "browser" as const, monthly: 150 },
  { key: "emailOutbound" as const, monthly: 150 },
  { key: "computerUse" as const, monthly: 250 },
];

// Sprint 20 — added `free` cells across every row + new
// `monthlyConversations` / `agents` rows so Free's headline limits show
// up directly in the comparison table.
const COMPARISON_ROWS = [
  // Sprint 20.1 — Free is Personal-Use-only: 1 seat, 0 sub-orgs,
  // 1 agent, 50 conversations. Aligned with TIER_LIMITS.free + the
  // legacy PLAN_LIMITS.FREE in src/lib/stripe.ts.
  { key: "memberSeats", free: "1", starter: "3", pro: "11", agencyPro: "Unlimited", enterprise: "Unlimited" },
  { key: "subOrgs", free: "—", starter: "10", pro: "50", agencyPro: "Unlimited", enterprise: "Unlimited" },
  { key: "agents", free: "1", starter: "Unlimited", pro: "Unlimited", agencyPro: "Unlimited", enterprise: "Unlimited" },
  { key: "monthlyConversations", free: "50", starter: "1.000", pro: "5.000", agencyPro: "25.000", enterprise: "Unlimited" },
  { key: "customDomain", free: "—", starter: "✓ Sub-Org", pro: "✓ Sub-Org", agencyPro: "✓ Sub-Org", enterprise: "✓" },
  { key: "agencyDomain", free: "—", starter: "—", pro: "✓", agencyPro: "✓", enterprise: "✓" },
  { key: "rbac", free: "—", starter: "✓", pro: "✓", agencyPro: "✓", enterprise: "✓" },
  { key: "templates", free: "—", starter: "✓", pro: "✓", agencyPro: "✓", enterprise: "✓" },
  { key: "stripeConnect", free: "—", starter: "—", pro: "—", agencyPro: "✓", enterprise: "✓" },
  {
    key: "support",
    free: "supportCommunity" as const,
    starter: "supportEmail" as const,
    pro: "supportPriority" as const,
    agencyPro: "supportSlack" as const,
    enterprise: "supportDedicated" as const,
  },
  { key: "sla", free: "—", starter: "—", pro: "—", agencyPro: "Optional", enterprise: "✓" },
];

export default async function PricingPage() {
  const t = await getTranslations("marketing.pricing");
  return (
    <PricingClient
      tiers={TIERS}
      modules={MODULES}
      comparisonRows={COMPARISON_ROWS}
      labels={{
        heroTitle: t("heroTitle"),
        heroSubtitle: t("heroSubtitle"),
        monthly: t("monthly"),
        yearly: t("yearly"),
        perMonth: t("perMonth"),
        custom: t("custom"),
        mostPopular: t("mostPopular"),
        startNow: t("startNow"),
        startFree: t("startFree"),
        forever: t("forever"),
        contactSales: t("contactSales"),
        modulesTitle: t("modulesTitle"),
        modulesSubtitle: t("modulesSubtitle"),
        byokTitle: t("byokTitle"),
        byokSubtitle: t("byokSubtitle"),
        byokExplanation: t("byokExplanation"),
        byokColOriginal: t("byokColOriginal"),
        byokColBYOK: t("byokColBYOK"),
        comparisonTitle: t("comparisonTitle"),
        comparisonSubtitle: t("comparisonSubtitle"),
        finalCtaTitle: t("finalCtaTitle"),
        finalCtaSubtitle: t("finalCtaSubtitle"),
        finalCtaButton: t("finalCtaButton"),
        tierNames: {
          free: t("tiers.free.name"),
          starter: t("tiers.starter.name"),
          professional: t("tiers.professional.name"),
          agencyPro: t("tiers.agencyPro.name"),
          enterprise: t("tiers.enterprise.name"),
        },
        tierSubtitles: {
          free: t("tiers.free.subtitle"),
          starter: t("tiers.starter.subtitle"),
          professional: t("tiers.professional.subtitle"),
          agencyPro: t("tiers.agencyPro.subtitle"),
          enterprise: t("tiers.enterprise.subtitle"),
        },
        tierFeatures: {
          free: t.raw("tiers.free.features") as string[],
          starter: t.raw("tiers.starter.features") as string[],
          professional: t.raw("tiers.professional.features") as string[],
          agencyPro: t.raw("tiers.agencyPro.features") as string[],
          enterprise: t.raw("tiers.enterprise.features") as string[],
        },
        moduleNames: {
          voice: t("modules.voice.name"),
          browser: t("modules.browser.name"),
          emailOutbound: t("modules.emailOutbound.name"),
          computerUse: t("modules.computerUse.name"),
        },
        moduleDescriptions: {
          voice: t("modules.voice.description"),
          browser: t("modules.browser.description"),
          emailOutbound: t("modules.emailOutbound.description"),
          computerUse: t("modules.computerUse.description"),
        },
        comparisonLabels: {
          memberSeats: t("comparison.memberSeats"),
          subOrgs: t("comparison.subOrgs"),
          monthlyConversations: t("comparison.monthlyConversations"),
          agents: t("comparison.agents"),
          customDomain: t("comparison.customDomain"),
          agencyDomain: t("comparison.agencyDomain"),
          rbac: t("comparison.rbac"),
          templates: t("comparison.templates"),
          stripeConnect: t("comparison.stripeConnect"),
          support: t("comparison.support"),
          supportCommunity: t("comparison.supportCommunity"),
          supportEmail: t("comparison.supportEmail"),
          supportPriority: t("comparison.supportPriority"),
          supportSlack: t("comparison.supportSlack"),
          supportDedicated: t("comparison.supportDedicated"),
          sla: t("comparison.sla"),
        },
      }}
    />
  );
}
