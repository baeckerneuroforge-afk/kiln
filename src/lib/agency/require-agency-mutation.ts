/**
 * Sprint 20.1 — Mutation-gate helper for /api/agency/sub-orgs/[id]/* routes.
 *
 * Wraps the existing requireSubOrgAccess() helper (which proves the
 * caller is acting in their agency org AND the sub-org belongs to
 * that agency) and adds a role-floor check on top:
 *
 *   - OWNER  → allowed
 *   - ADMIN  → allowed
 *   - CONSULTANT, VIEWER → 403 forbidden
 *
 * This closes the Sprint 19.7.6 gap flagged in sub-org-auth.ts: until
 * each mutating route declares its own SubOrgPermission floor (planned
 * for the Sprint 20.2 auth-migration), every mutation goes through
 * this one gate. CONSULTANT + VIEWER can still hit the read-only GET
 * routes — those keep using requireSubOrgAccess() directly.
 *
 * The 403 carries `errorCode: "INSUFFICIENT_AGENCY_ROLE"` so the
 * client can render a "Ask your agency owner" prompt without parsing
 * free-text. We do NOT leak the user's actual role in the response —
 * a CONSULTANT trying to mutate sees the same 403 as a non-member
 * (defense-in-depth against enumeration via role-probing).
 *
 * Cross-agency probing stays a 404 (handled by requireSubOrgAccess),
 * so the existence of a sub-org under a different agency cannot be
 * confirmed via this endpoint either.
 *
 * NOTE — this helper does NOT replace sub-org-auth.ts. Read-only
 * routes (GET /activity, /agents, /invoices, /members, /modules,
 * /stats, /workflows, /branding GET, /[id] GET) keep using
 * requireSubOrgAccess() directly so CONSULTANT + VIEWER stay
 * able to see what they're assigned to.
 */
import type { AgencyRole, AgencyMembership, OrgRelationship } from "@prisma/client";
import {
  requireSubOrgAccess,
  type SubOrgAuthResult,
} from "./sub-org-auth";
import { getAgencyMembership } from "@/lib/permissions/agency-permissions";

export type AgencyMutationAuthResult =
  | {
      ok: true;
      relationship: OrgRelationship;
      userId: string;
      agencyOrgId: string;
      membership: AgencyMembership;
    }
  | { ok: false; response: Response };

const MUTATION_ROLES: ReadonlySet<AgencyRole> = new Set<AgencyRole>([
  "OWNER",
  "ADMIN",
]);

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
  const base: SubOrgAuthResult = await requireSubOrgAccess(relationshipId);
  if (!base.ok) return { ok: false, response: base.response };

  const membership = await getAgencyMembership(base.userId, base.agencyOrgId);
  // No agency-membership row at all → treat like a non-member trying
  // to mutate. Clerk owns the org-side identity but our RBAC is
  // KILN-side: a Clerk org admin who never accepted the AgencyMembership
  // invitation has no business mutating sub-org state.
  if (!membership || !MUTATION_ROLES.has(membership.role)) {
    return {
      ok: false,
      response: Response.json(
        {
          error: "Insufficient role for this action",
          errorCode: "INSUFFICIENT_AGENCY_ROLE",
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    relationship: base.relationship,
    userId: base.userId,
    agencyOrgId: base.agencyOrgId,
    membership,
  };
}
