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
