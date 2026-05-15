/**
 * Sprint 19.9 — /dashboard/settings/language.
 *
 * Single setting per page (matches the rest of /dashboard/settings/*).
 * Renders the inline variant of LocaleSwitcher so the user sees both
 * options laid out as full-row toggles rather than a popover menu.
 */
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

export const dynamic = "force-dynamic";

export default async function LanguageSettingsPage() {
  const t = await getTranslations("settings.languagePage");
  return (
    <div className="mx-auto max-w-2xl py-8" data-testid="language-settings-page">
      <header className="mb-6">
        <h1 className="font-serif text-2xl text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <section className="rounded-xl border border-border bg-card p-6">
        <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
          {t("label")}
        </p>
        <LocaleSwitcher variant="inline" />
        <p className="mt-4 text-xs text-muted-foreground">{t("saveHint")}</p>
      </section>
    </div>
  );
}
