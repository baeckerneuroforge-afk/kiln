import { listAgencyDomains } from "@/lib/domains/agency-domain-manager";

/**
 * Open-Redirect-Schutz für Stripe-Checkout-Return-URLs (success/cancel).
 *
 * Diese URLs dürfen bewusst client-geliefert sein, damit White-Label-Agencies
 * auf ihre eigene (verifizierte) Custom-Domain zurückleiten können. Ohne
 * Validierung könnte aber ein Angreifer — insbesondere am ANONYMEN Endpoint
 * /api/onboarding/[id]/checkout — eine beliebige Domain einschleusen, die dann
 * in Stripes success_url/cancel_url landet.
 *
 * Erlaubt werden nur Origins von:
 *   1. der App-eigenen Origin (NEXT_PUBLIC_APP_URL; localhost nur außerhalb Prod)
 *   2. den VERIFIZIERTEN (status ACTIVE) Custom-Domains der jeweiligen Agency
 *
 * Andernfalls wird der sichere Fallback zurückgegeben.
 *
 * @param candidate     Die client-gelieferte URL (body.successUrl / body.cancelUrl).
 * @param agencyOrgId   Clerk-Org-Id der Agency (relationship.parentOrgId).
 * @param fallback      Sichere Default-URL, falls der Kandidat nicht erlaubt ist.
 */
export async function resolveSafeCheckoutUrl(
  candidate: string | undefined | null,
  agencyOrgId: string,
  fallback: string,
): Promise<string> {
  if (typeof candidate !== "string" || candidate.length === 0) return fallback;

  const allowedOrigins = new Set<string>();
  const addOrigin = (value: string) => {
    try {
      allowedOrigins.add(new URL(value).origin);
    } catch {
      /* unparsbare Quelle ignorieren */
    }
  };

  if (process.env.NEXT_PUBLIC_APP_URL) addOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (process.env.NODE_ENV !== "production") addOrigin("http://localhost:3000");

  // Verifizierte White-Label-Domains der Agency zulassen.
  try {
    const domains = await listAgencyDomains({ agencyOrgId });
    for (const domain of domains) {
      if (domain.status === "ACTIVE") addOrigin(`https://${domain.hostname}`);
    }
  } catch {
    // Domain-Lookup fehlgeschlagen → fail-safe: nur App-Origin erlauben.
  }

  try {
    const url = new URL(candidate);
    // Nur http(s) zulassen — blockt javascript:/ftp: etc.
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    // Origin-Vergleich (Schema + Host + Port).
    return allowedOrigins.has(url.origin) ? candidate : fallback;
  } catch {
    return fallback;
  }
}
