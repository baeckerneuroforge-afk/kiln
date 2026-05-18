/**
 * Sprint 20.1 — Mutation-gate helper for /api/agency/sub-orgs/[id]/* routes.
 *
 * Wraps the unified Sprint 20.2 requireSubOrgAccess() helper to prove the
 * caller is acting in their agency org, the sub-org belongs to that agency,
 * and the caller's AgencyMembership role is high enough:
 *
 *   - OWNER  → allowed
 *   - ADMIN  → allowed
 *   - CONSULTANT, VIEWER → 403 forbidden
 *
 * CONSULTANT + VIEWER can still hit the read-only GET routes according
 * to each route's own role matrix, but every mutation goes through this
 * single OWNER/ADMIN gate.
 *
 * The 403 carries `errorCode: "INSUFFICIENT_AGENCY_ROLE"` so the client
 * can render a "Ask your agency owner" prompt without parsing free-text.
 * Missing AgencyMembership rows collapse to 404 inside the unified helper
 * so a Clerk org member cannot probe sub-org existence without KILN RBAC.
 *
 * Cross-agency probing stays a 404 (handled by requireSubOrgAccess),
 * so the existence of a sub-org under a different agency cannot be
 * confirmed via this endpoint either.
 *
 * NOTE — this helper keeps the Sprint 20.1 return shape stable for route
 * callers while the underlying auth source moves off legacy sub-org-auth.ts.
 */
import type { AgencyMembership, OrgRelationship } from "@prisma/client";
import {
  requireSubOrgAccess,
} from "@/lib/permissions/require-sub-org-access";

export type AgencyMutationAuthResult =
  | {
      ok: true;
      relationship: OrgRelationship;
      userId: string;
      agencyOrgId: string;
      membership: AgencyMembership;
    }
  | { ok: false; response: Response };

/**
 * Mutation-only auth gate. Returns the resolved relationship +
 * agency-membership on success, or a pre-built 403 Response when the
 * caller's role is below OWNER/ADMIN.
 *
 * If the underlying requireSubOrgAccess() rejects (no auth, no
 * active org, sub-org not in this agency), we propagate that
 * response unchanged so we don't accidentally weaken its 401/400/404
 * envelopes.
 */
export async function requireAgencyMutation(
  relationshipId: string,
): Promise<AgencyMutationAuthResult> {
  const access = await requireSubOrgAccess(relationshipId, {
    requiredAgencyRole: ["OWNER", "ADMIN"],
  });
  if (!access.ok) return { ok: false, response: access.response };

  return {
    ok: true,
    relationship: access.relationship,
    userId: access.userId,
    agencyOrgId: access.agencyOrgId,
    membership: access.agencyMembership,
  };
}
