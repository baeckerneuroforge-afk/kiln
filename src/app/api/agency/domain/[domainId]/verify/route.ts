/**
 * Sprint 19.8.1 — POST /api/agency/domain/[domainId]/verify.
 *
 * OWNER + ADMIN may trigger verification (DNS check is operational,
 * not destructive — same trust level as flipping a feature flag).
 *
 * Always invalidates the hostname cache so the next middleware lookup
 * picks up the new status without waiting for the TTL.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireAgencyAccess } from "@/lib/permissions/require-agency-access";
import { verifyAgencyDomain } from "@/lib/domains/agency-domain-manager";
import { getDefaultHostnameCache } from "@/lib/domains/hostname-cache";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { domainId: string } },
) {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!agencyOrgId) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }
  const access = await requireAgencyAccess(agencyOrgId);
  if (!access.ok) return access.response;
  if (access.membership.role !== "OWNER" && access.membership.role !== "ADMIN") {
    return Response.json(
      { error: "Only OWNER or ADMIN can verify the agency domain" },
      { status: 403 },
    );
  }

  const domain = await prisma.agencyDomain.findUnique({
    where: { id: params.domainId },
    select: { id: true, agencyOrgId: true, hostname: true },
  });
  if (!domain || domain.agencyOrgId !== agencyOrgId) {
    return Response.json({ error: "Domain not found" }, { status: 404 });
  }

  const result = await verifyAgencyDomain({ domainId: params.domainId });
  if (!result.ok) {
    return Response.json(
      { error: result.error, code: result.code },
      { status: 502 },
    );
  }

  getDefaultHostnameCache().delete(domain.hostname);

  return Response.json({
    id: result.domain.id,
    hostname: result.domain.hostname,
    status: result.domain.status,
    sslStatus: result.domain.sslStatus,
    sslIssuedAt: result.domain.sslIssuedAt,
  });
}
