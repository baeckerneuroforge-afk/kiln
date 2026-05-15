/**
 * Sprint 19.8 — Hostname validation + normalisation.
 *
 * Custom-domain hostnames are user-typed strings — we normalise to a
 * canonical form (lower-case, no port, no trailing dot, no path) before
 * they hit Vercel or the DB. Validation is intentionally strict:
 *   - Must include at least one dot ("localhost" or "foo" rejected)
 *   - Each label 1–63 chars, alphanumeric or hyphen, no leading/trailing hyphen
 *   - Total length ≤ 253
 *   - No wildcard prefixes ("*.example.com" — out of scope)
 *
 * We deliberately reject apex+app domains we own (kilnbase.com,
 * *.vercel.app) so a malicious sub-org owner can't bind their workspace
 * to the marketing site or another agency's preview.
 */

const RESERVED_SUFFIXES: readonly string[] = [
  "kilnbase.com",
  "hephaistos-systems.de",
  "vercel.app",
  "vercel.com",
];

const LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\.$/, "") // trailing dot in FQDNs
    .replace(/:\d+$/, "") // strip port if pasted with one
    .replace(/^https?:\/\//, "") // strip scheme if user pasted a URL
    .replace(/\/.*$/, ""); // strip path/query
}

export type HostnameValidationResult =
  | { ok: true; hostname: string }
  | { ok: false; reason: string };

export function validateHostname(input: string): HostnameValidationResult {
  const hostname = normalizeHostname(input);
  if (!hostname) {
    return { ok: false, reason: "hostname is empty" };
  }
  if (hostname.length > 253) {
    return { ok: false, reason: "hostname exceeds 253 characters" };
  }
  if (hostname.startsWith("*.") || hostname.includes("*")) {
    return { ok: false, reason: "wildcard hostnames are not supported" };
  }
  const labels = hostname.split(".");
  if (labels.length < 2) {
    return { ok: false, reason: "hostname must contain at least one dot" };
  }
  for (const label of labels) {
    if (!LABEL_REGEX.test(label)) {
      return {
        ok: false,
        reason: `invalid label \"${label}\" — alphanumeric with internal hyphens only`,
      };
    }
  }
  for (const reserved of RESERVED_SUFFIXES) {
    if (hostname === reserved || hostname.endsWith(`.${reserved}`)) {
      return {
        ok: false,
        reason: `hostname \"${hostname}\" is reserved`,
      };
    }
  }
  return { ok: true, hostname };
}

export const __test__ = { RESERVED_SUFFIXES, LABEL_REGEX };
