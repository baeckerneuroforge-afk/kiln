/**
 * Sprint 19.7.6 — middleware-style helper for agency routes.
 *
 * Validates that the caller is an agency-member of `agencyClerkOrgId`
 * and (optionally) holds a specific AgencyPermission. Mirrors the
 * sub-org helper's shape so callers stay symmetric:
 *
 *   const access = await requireAgencyAccess(orgId, "billing.manage");
 *   if (!access.ok) return access.response;
 *   const { membership, userId } = access;
 *
 * 401 when unauthenticated, 404 when no AgencyMembership row exists
 * (existence-hiding — same rationale as the sub-org helper), 403 when
 * the user is a member but lacks the requested permission.
 */
import { auth } from "@clerk/nextjs/server";
import type { AgencyMembership } from "@prisma/client";
import {
  getAgencyMembership,
  permissionsForAgencyRole,
  type AgencyPermission,
} from "@/lib/permissions/agency-permissions";

export type AgencyAccessResult =
  | {
      ok: true;
      membership: AgencyMembership;
      userId: string;
    }
  | { ok: false; response: Response };

export async function requireAgencyAccess(
  agencyClerkOrgId: string,
  permission?: AgencyPermission,
): Promise<AgencyAccessResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const membership = await getAgencyMembership(userId, agencyClerkOrgId);
  if (!membership) {
    return {
      ok: false,
      response: Response.json({ error: "Agency not found" }, { status: 404 }),
    };
  }

  if (permission && !permissionsForAgencyRole(membership.role).has(permission)) {
    return {
      ok: false,
      response: Response.json(
        { error: "Insufficient permission", permission },
        { status: 403 },
      ),
    };
  }

  return { ok: true, membership, userId };
}
