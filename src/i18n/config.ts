/**
 * Sprint 19.9 — i18n configuration.
 *
 * Locales:
 *   - de: default (DACH-Sales-Start 19. Mai)
 *   - en: international fallback (US-Expansion ab Q1 2027)
 *
 * **URL-Strategy decision:** This sprint runs WITHOUT a URL locale
 * prefix (no `/de/dashboard` vs `/en/dashboard`). Locale is resolved
 * via cookie + `User.preferredLanguage` + Accept-Language header at
 * request-time inside `getRequestConfig`. Reasoning:
 *
 *   1. Sprint 19.8/19.8.1 custom-domain routing rewrites paths to
 *      `/dashboard/sub-org/[id]/...` and `/a/_agency-entry`. A
 *      URL-prefix locale would force `[locale]/dashboard/...` everywhere
 *      and break those rewrites without extensive refactoring.
 *   2. KILN's dashboard isn't an SEO target (auth-walled). Marketing
 *      pages, where SEO matters, are out of scope for this sprint and
 *      can later get a separate `[locale]` segment if needed.
 *   3. DACH-Sales-Start is 4 days out; a full `app/[locale]/` folder
 *      restructure is a multi-day refactor with high regression risk.
 *
 * URL-prefix can be re-introduced in a follow-up sprint when marketing
 * pages or external SEO demands it. The translation infrastructure
 * (namespaces, messages files, type-safe keys) stays identical.
 */

export const SUPPORTED_LOCALES = ["de", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "de";

/** Cookie key for the visitor's locale preference (unauthenticated and authenticated users). */
export const LOCALE_COOKIE = "kiln_locale";

/** 1 year — locale survives across browser restarts. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Locale resolution chain — caller passes whatever signals they have,
 * pure function decides. Used by both the request-config (server) and
 * the cookie-set on locale change (client → API).
 *
 * Priority (highest wins):
 *   1. Explicit override (e.g. test fixture or temporary preview)
 *   2. Logged-in user's preferredLanguage column
 *   3. `kiln_locale` cookie
 *   4. Accept-Language header — first supported locale found
 *   5. DEFAULT_LOCALE ("de")
 */
export function resolveLocaleFromSignals(args: {
  override?: string | null;
  userPreferredLanguage?: string | null;
  cookieValue?: string | null;
  acceptLanguage?: string | null;
}): SupportedLocale {
  if (args.override && isSupportedLocale(args.override)) return args.override;
  if (
    args.userPreferredLanguage &&
    isSupportedLocale(args.userPreferredLanguage)
  ) {
    return args.userPreferredLanguage;
  }
  if (args.cookieValue && isSupportedLocale(args.cookieValue)) {
    return args.cookieValue;
  }
  if (args.acceptLanguage) {
    const fromHeader = parseAcceptLanguage(args.acceptLanguage);
    if (fromHeader) return fromHeader;
  }
  return DEFAULT_LOCALE;
}

/**
 * Naive Accept-Language parser — picks the first supported locale by
 * its 2-letter language tag. We don't honor q-weights because the
 * supported set is so small the precision doesn't matter.
 */
function parseAcceptLanguage(header: string): SupportedLocale | null {
  const tokens = header.split(",").map((s) => s.trim().split(";")[0]);
  for (const tag of tokens) {
    const lang = tag.split("-")[0].toLowerCase();
    if (isSupportedLocale(lang)) return lang;
  }
  return null;
}
