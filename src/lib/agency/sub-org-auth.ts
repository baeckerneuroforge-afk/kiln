/**
 * Shared auth helper for /api/agency/sub-orgs/[id]/* routes.
 *
 * Verifies the caller is acting in their agency org and that the
 * referenced sub-org actually belongs to that agency. Returns either
 * the resolved relationship row or an early Response the route should
 * propagate as-is.
 *
 * Cross-agency access is rejected as 404 (not 403) so the existence of
 * a sub-org under a different agency cannot be probed by ID-guessing.
 *
 * TODO Sprint 19.7.7 — auth-model consolidation.
 *
 * This helper assumes the caller is in agency-mode (auth().orgId is
 * the parent agency org). That broke for sub-org-mode end-users on
 * the invite endpoint (Sprint 19.7.6.2 fixed invite/ by switching to
 * SubOrgMembership-driven auth via canManageSubOrgMembers). Seven
 * sibling routes — members/, members/[id]/, agents/, workflows/,
 * stats/, invoices/, branding/ — still use this helper and would
 * exhibit the same bug if reached from a sub-org-mode session.
 *
 * They're not user-facing in sub-org-mode today (the sub-org pages
 * fetch via Prisma helpers, not these HTTP routes), so the bug is
 * latent. The right fix is a per-route `requiredPermission` argument
 * to a unified helper, so each route declares its own
 * SubOrgPermission floor (agents.read, memberships.manage, …) instead
 * of relying on "you're the agency owner therefore you can do
 * anything". Out of scope for this sprint.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { OrgRelationship } from "@prisma/client";

export type SubOrgAuthResult =
  | { ok: true; relationship: OrgRelationship; userId: string; agencyOrgId: string }
  | { ok: false; response: Response };

export async function requireSubOrgAccess(
  relationshipId: string,
): Promise<SubOrgAuthResult> {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!agencyOrgId) {
    return {
      ok: false,
      response: Response.json(
        { error: "No active organization. Switch to your agency org first." },
        { status: 400 },
      ),
    };
  }

  const relationship = await prisma.orgRelationship.findFirst({
    where: { id: relationshipId, parentOrgId: agencyOrgId },
  });
  if (!relationship) {
    return {
      ok: false,
      response: Response.json({ error: "Sub-org not found" }, { status: 404 }),
    };
  }

  return { ok: true, relationship, userId, agencyOrgId };
}
