/**
 * Sprint 19.8 — POST /api/sub-orgs/[id]/domains/[domainId]/verify.
 *
 * Re-runs verification against Vercel after the user has updated their
 * DNS. Sync the resulting status into our row. Idempotent — repeated
 * calls don't damage state, they just refresh the picture.
 *
 * Same auth as POST /domains: OWNER/ADMIN only.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  canManageSubOrgMembers,
  getUserSubOrgMembership,
} from "@/lib/permissions/sub-org-permissions";
import { verifyDomain } from "@/lib/domains/domain-manager";
import { getDefaultHostnameCache } from "@/lib/domains/hostname-cache";

export const dynamic = "force-dynamic";

export async function POST(
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

  const domain = await prisma.customDomain.findUnique({
    where: { id: params.domainId },
    select: { id: true, subOrgId: true, hostname: true },
  });
  if (!domain || domain.subOrgId !== params.id) {
    return Response.json({ error: "Domain not found" }, { status: 404 });
  }

  const result = await verifyDomain({ domainId: params.domainId });
  if (!result.ok) {
    return Response.json(
      { error: result.error, code: result.code },
      { status: 502 },
    );
  }

  // Status flipped → drop the cache entry so middleware re-resolves on
  // the next request. The set in the cache happens lazily on the next
  // /custom-domain hit.
  getDefaultHostnameCache().delete(domain.hostname);

  return Response.json({
    id: result.domain.id,
    hostname: result.domain.hostname,
    status: result.domain.status,
    sslStatus: result.domain.sslStatus,
    sslIssuedAt: result.domain.sslIssuedAt,
  });
}
