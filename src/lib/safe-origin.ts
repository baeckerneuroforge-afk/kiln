/**
 * Open-Redirect-Schutz für client-gelieferte `origin`-Werte.
 *
 * Wenn ein vom Client geschickter origin-Wert ungeprüft in Redirect-/Callback-
 * URLs einfließt (z.B. Stripe-Connect-Return-URLs), kann ein Angreifer den
 * Redirect auf eine fremde Domain umlenken. Dieser Helper validiert den Wert
 * gegen eine Allowlist (die App-eigene Origin + localhost außerhalb von Prod)
 * und fällt andernfalls auf eine sichere Fallback-Origin zurück.
 *
 * @param candidate  Der zu prüfende Wert (typischerweise body.origin).
 * @returns          Der Kandidat, falls dessen Origin erlaubt ist — sonst der Fallback.
 */
export function resolveSafeOrigin(candidate: unknown): string {
  const fallback = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (typeof candidate !== "string" || candidate.length === 0) return fallback;

  const isProd = process.env.NODE_ENV === "production";
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    // localhost nur außerhalb von Production zulassen (verhindert unnötige
    // Verbreiterung der Allowlist im Prod-Env).
    isProd ? null : "http://localhost:3000",
  ]
    .filter((u): u is string => Boolean(u))
    .map((u) => {
      try {
        return new URL(u).origin;
      } catch {
        return null;
      }
    })
    .filter((o): o is string => o !== null);

  try {
    const url = new URL(candidate);
    // Nur http(s) zulassen — blockt javascript:/ftp:/vbscript:-URLs, deren Host
    // sonst zufällig "passen" und in einem Redirect/Location-Header landen könnte.
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    // Origin-Vergleich (Schema + Host + Port) statt nur Host: blockt zusätzlich
    // Scheme-Downgrade (http statt https) und userinfo-Tricks (…@evil.com).
    return allowedOrigins.includes(url.origin) ? candidate : fallback;
  } catch {
    return fallback;
  }
}
