/**
 * Sprint 19.7.6 — caller's effective agency role + permissions.
 *
 * Used by the sidebar (client-side) to conditionally show/hide
 * Team / Billing / Sub-Orgs items. Also auto-bootstraps an OWNER row
 * for Clerk org-admins who don't have an AgencyMembership yet, so the
 * first-load experience for legacy agency owners doesn't briefly hide
 * everything.
 *
 * Returns { role: null, permissions: [] } when the user has no
 * AgencyMembership at all (sub-org-only users, personal-org users).
 */
import { auth } from "@clerk/nextjs/server";
import {
  ensureAgencyMembershipFromClerkRole,
  permissionsForAgencyRole,
} from "@/lib/permissions/agency-permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !orgId) {
    return Response.json({ role: null, permissions: [] });
  }

  const membership = await ensureAgencyMembershipFromClerkRole(
    userId,
    orgId,
    orgRole ?? null,
  );
  if (!membership) {
    return Response.json({ role: null, permissions: [] });
  }

  return Response.json({
    role: membership.role,
    permissions: Array.from(permissionsForAgencyRole(membership.role)),
  });
}
