/**
 * Sprint 19.8 — Server-Component helper for custom-domain context.
 *
 * Middleware sets three headers when it rewrites a custom-domain
 * request to /dashboard/sub-org/[id]/...:
 *   - x-custom-domain  — the hostname the user typed in their browser
 *   - x-sub-org-id     — resolved sub-org id (== OrgRelationship.id)
 *   - x-kiln-host      — alias of x-custom-domain (kept for legacy)
 *
 * Server components call `getCustomDomainContext()` to decide whether
 * to render branded chrome (Sub-Org logo / colors) and whether links
 * should stay on the custom domain or jump back to kilnbase.com.
 *
 * Functions return `null` outside of the custom-domain branch so
 * normal kilnbase.com requests don't accidentally pick up sub-org
 * context.
 */
import { headers } from "next/headers";

export interface CustomDomainContext {
  hostname: string;
  subOrgId: string;
}

/**
 * Returns the custom-domain context for the current request, or null
 * when the request is on kilnbase.com (or the headers haven't been
 * threaded — usually the test-environment case).
 */
export async function getCustomDomainContext(): Promise<CustomDomainContext | null> {
  const hdrs = await headers();
  const hostname = hdrs.get("x-custom-domain");
  const subOrgId = hdrs.get("x-sub-org-id");
  if (!hostname || !subOrgId) return null;
  return { hostname, subOrgId };
}

/**
 * Cheap "is this a custom-domain request" check without pulling the
 * full context shape — useful for rendering decisions where you don't
 * care about the values.
 */
export async function isCustomDomainRequest(): Promise<boolean> {
  const ctx = await getCustomDomainContext();
  return ctx !== null;
}
