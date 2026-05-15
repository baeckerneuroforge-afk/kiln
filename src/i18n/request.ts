/**
 * Sprint 19.9 — next-intl request-config (server-side).
 *
 * Called once per request by NextIntlClientProvider / getTranslations.
 * We resolve the visitor's locale from cookie + DB + headers (see
 * resolveLocaleFromSignals) and return the matching messages bundle.
 *
 * Why this file vs middleware: we deliberately don't use next-intl's
 * URL-based middleware (no `/de/...` vs `/en/...` prefix in this
 * sprint — see i18n/config.ts for rationale). This `getRequestConfig`
 * is the entry point next-intl reads to resolve locale per request
 * without any URL rewriting.
 */
import { cookies, headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { getRequestConfig } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  resolveLocaleFromSignals,
  type SupportedLocale,
} from "./config";

export default getRequestConfig(async () => {
  const locale = await resolveServerLocale();
  // next-intl will throw if the JSON is missing — bake DE fallback
  // import at module-load time so a deploy without the file fails
  // loud rather than serving English-by-accident.
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});

/**
 * Server-side locale resolver. Reads cookie + Accept-Language header +
 * Clerk auth → User.preferredLanguage. Exported separately so a layout
 * or a route handler can mirror the same resolution without re-creating
 * the chain.
 */
export async function resolveServerLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  const hdrs = await headers();

  let userPreferredLanguage: string | null = null;
  try {
    const { userId } = await auth();
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { preferredLanguage: true },
      });
      userPreferredLanguage = user?.preferredLanguage ?? null;
    }
  } catch {
    // Auth unreachable (e.g. during static rendering of a public page).
    // Falls through to cookie + header resolution.
  }

  return resolveLocaleFromSignals({
    userPreferredLanguage,
    cookieValue: cookieStore.get(LOCALE_COOKIE)?.value ?? null,
    acceptLanguage: hdrs.get("accept-language"),
  });
}

export { DEFAULT_LOCALE };
