"use client";

/**
 * Sprint 19.9 — locale switcher dropdown.
 *
 * Renders a single button showing the current locale's flag/short
 * code. Click opens a small menu with the alternative locale(s).
 * Selection: POST to /api/user/locale (writes cookie + User column),
 * then router.refresh() so the next server-render uses the new
 * locale. We don't hard-reload — refresh() preserves scroll +
 * client-state on the way back.
 *
 * Placeable in header bars or settings pages. Reads the active locale
 * from next-intl's `useLocale()` so it always reflects the actual
 * resolved value, not whatever the cookie happens to say.
 */
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Languages } from "lucide-react";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({
  className,
  variant = "menu",
}: {
  className?: string;
  /** "menu" = popover trigger; "inline" = full row used in settings page */
  variant?: "menu" | "inline";
}) {
  const router = useRouter();
  const activeLocale = useLocale() as SupportedLocale;
  const t = useTranslations("locale");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function pick(locale: SupportedLocale) {
    if (locale === activeLocale) {
      setOpen(false);
      return;
    }
    try {
      await fetch("/api/user/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      setOpen(false);
      startTransition(() => router.refresh());
    } catch {
      // Fail-soft: keep the dropdown open so the user can retry.
    }
  }

  if (variant === "inline") {
    return (
      <div
        className={cn("flex flex-col gap-2", className)}
        data-testid="locale-switcher-inline"
      >
        {SUPPORTED_LOCALES.map((loc) => {
          const isActive = loc === activeLocale;
          return (
            <button
              key={loc}
              type="button"
              onClick={() => pick(loc)}
              disabled={pending || isActive}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
                isActive
                  ? "border-kiln-orange/50 bg-kiln-orange/10 text-foreground"
                  : "border-border bg-background hover:border-foreground/30",
              )}
              data-testid={`locale-option-${loc}`}
            >
              <span>{t(loc)}</span>
              {isActive && <Check className="h-4 w-4" />}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)} data-testid="locale-switcher">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("switchLabel")}
        data-testid="locale-switcher-trigger"
      >
        <Languages className="h-3.5 w-3.5" />
        <span className="uppercase tracking-wide">{activeLocale}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-32 overflow-hidden rounded-md border border-border bg-card text-sm shadow-lg"
          data-testid="locale-switcher-menu"
        >
          {SUPPORTED_LOCALES.map((loc) => {
            const isActive = loc === activeLocale;
            return (
              <button
                key={loc}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => pick(loc)}
                disabled={pending}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left",
                  isActive
                    ? "bg-kiln-orange/10 text-foreground"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
                data-testid={`locale-option-${loc}`}
              >
                <span>{t(loc)}</span>
                {isActive && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
