/**
 * Sprint 19.9 — POST /api/user/locale.
 *
 * Persists the visitor's chosen locale in two places:
 *   1. `kiln_locale` cookie — picked up immediately by next-intl on
 *      the next request, works for logged-in AND anonymous visitors.
 *   2. `User.preferredLanguage` — survives across devices / sessions
 *      for authenticated users.
 *
 * Returns 200 with the new locale on success. The client triggers a
 * router.refresh() (or full reload for the dashboard chrome) so
 * server components re-render with the new strings.
 *
 * Public-ish: anonymous visitors can set the cookie. Authenticated
 * visitors additionally get their User row updated. There's no risk
 * here — the value is constrained to the two-element `SupportedLocale`
 * set, so a malicious caller can at worst flip themselves between
 * "de" and "en".
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isSupportedLocale,
} from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    locale?: unknown;
  };
  if (!isSupportedLocale(body.locale)) {
    return Response.json(
      { error: "Unsupported locale" },
      { status: 400 },
    );
  }
  const locale = body.locale;

  // Logged-in users get the persistent column write so it follows them
  // across devices. Anonymous visitors stay on cookie-only — fine because
  // they'll set it again whenever they sign in.
  try {
    const { userId } = await auth();
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { preferredLanguage: locale },
      });
    }
  } catch (err) {
    // Auth lookup failed (e.g. transient Clerk outage). Cookie write
    // still happens — the visitor's choice isn't lost just because we
    // can't persist it server-side.
    console.warn("[locale] failed to persist preferredLanguage:", err);
  }

  const response = Response.json({ ok: true, locale });
  response.headers.append(
    "Set-Cookie",
    `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`,
  );
  return response;
}
