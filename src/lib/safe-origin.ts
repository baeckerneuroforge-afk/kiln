/**
 * Open-Redirect-Schutz für client-gelieferte `origin`-Werte.
 *
 * Wenn ein vom Client geschickter origin-Wert ungeprüft in Redirect-/Callback-
 * URLs einfließt (z.B. Stripe-Connect-Return-URLs), kann ein Angreifer den
 * Redirect auf eine fremde Domain umlenken. Dieser Helper validiert den Wert
 * gegen eine Allowlist (die App-eigene Origin + localhost in Dev) und fällt
 * andernfalls auf eine sichere Fallback-Origin zurück.
 *
 * @param candidate  Der zu prüfende Wert (typischerweise body.origin).
 * @returns          Der Kandidat, falls dessen Host erlaubt ist — sonst der Fallback.
 */
export function resolveSafeOrigin(candidate: unknown): string {
  const fallback = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (typeof candidate !== "string" || candidate.length === 0) return fallback;

  const allowedHosts = [process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000"]
    .filter((u): u is string => Boolean(u))
    .map((u) => {
      try {
        return new URL(u).host;
      } catch {
        return null;
      }
    })
    .filter((h): h is string => h !== null);

  try {
    const host = new URL(candidate).host;
    return allowedHosts.includes(host) ? candidate : fallback;
  } catch {
    return fallback;
  }
}
