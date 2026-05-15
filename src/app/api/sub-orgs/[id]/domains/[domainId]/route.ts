/**
 * Sprint 19.8 — DELETE /api/sub-orgs/[id]/domains/[domainId].
 *
 * Detaches a hostname from the project. Mirrors the auth model of the
 * parent listing route: caller must be OWNER/ADMIN on the sub-org.
 *
 * Cross-tenant deletes (trying to remove someone else's domain) return
 * 404 to match the existence-hiding contract.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  canManageSubOrgMembers,
  getUserSubOrgMembership,
} from "@/lib/permissions/sub-org-permissions";
import { removeCustomDomain } from "@/lib/domains/domain-manager";
import { getDefaultHostnameCache } from "@/lib/domains/hostname-cache";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; domainId: string } },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerMembership = await getUserSubOrgMembership(userId, params.id);
  if (!callerMembership) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  if (!canManageSubOrgMembers(callerMembership)) {
    return Response.json(
      { error: "Insufficient permission", permission: "memberships.manage" },
      { status: 403 },
    );
  }

  // Confirm the domain row really belongs to this sub-org. Otherwise an
  // OWNER on one sub-org could delete a domain attached to a different
  // sub-org by guessing the id.
  const domain = await prisma.customDomain.findUnique({
    where: { id: params.domainId },
    select: { id: true, subOrgId: true, hostname: true },
  });
  if (!domain || domain.subOrgId !== params.id) {
    return Response.json({ error: "Domain not found" }, { status: 404 });
  }

  const result = await removeCustomDomain({ domainId: params.domainId });
  if (!result.ok) {
    return Response.json(
      { error: result.error, code: result.code },
      { status: 502 },
    );
  }

  // Drop the cached hostname mapping so the next request on this
  // hostname goes through the legacy /a/_custom-domain branch
  // immediately rather than waiting for the TTL to expire.
  getDefaultHostnameCache().delete(domain.hostname);
  return Response.json({ ok: true });
}
