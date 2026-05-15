/**
 * Sprint 19.10 — public /faq page.
 *
 * Server component resolves the FAQ-data shape (categorized item-keys
 * referencing translation paths) and hands it to a client accordion.
 * Items live in messages/{de,en}.json under marketing.faq.items so
 * they're translatable + parity-tested.
 */
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FaqClient } from "@/components/marketing/faq-client";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.faq");
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

const FAQ_CATEGORIES = [
  {
    titleKey: "categoryGeneral" as const,
    items: ["whatIsKiln", "forWhom", "vsCompetitors", "dsgvo", "dataLocation"] as const,
  },
  {
    titleKey: "categoryWhitelabel" as const,
    items: ["multiTenant", "subOrg", "ownDomain", "customerSeesBranding", "howManyCustomers"] as const,
  },
  {
    titleKey: "categoryPricing" as const,
    items: ["paymentMethods", "cancelMonthly", "freeTrial", "afterCancellation", "annualContract"] as const,
  },
  {
    titleKey: "categoryTech" as const,
    items: ["aiModels", "byok", "integrations", "api", "security"] as const,
  },
  {
    titleKey: "categorySupport" as const,
    items: ["whoIsBehindKiln", "supportSpeed", "onboardingHelp", "maxSubOrgs"] as const,
  },
];

export default async function FaqPage() {
  const t = await getTranslations("marketing.faq");
  const itemsT = await getTranslations("marketing.faq.items");

  const categories = FAQ_CATEGORIES.map((cat) => ({
    title: t(cat.titleKey),
    items: cat.items.map((itemKey) => ({
      id: itemKey,
      q: itemsT(`${itemKey}.q`),
      a: itemsT(`${itemKey}.a`),
    })),
  }));

  return (
    <FaqClient
      heroTitle={t("heroTitle")}
      heroSubtitle={t("heroSubtitle")}
      categories={categories}
      contactCtaTitle={t("contactCtaTitle")}
      contactCtaBody={t("contactCtaBody")}
      contactCtaButton={t("contactCtaButton")}
    />
  );
}
