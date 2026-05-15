/**
 * Sprint 19.8.1 — DELETE /api/agency/domain/[domainId].
 *
 * OWNER-only. Cross-tenant deletes (trying to remove a domain that
 * belongs to a different agency org) return 404 to match the
 * existence-hiding contract.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireAgencyAccess } from "@/lib/permissions/require-agency-access";
import { removeAgencyDomain } from "@/lib/domains/agency-domain-manager";
import { getDefaultHostnameCache } from "@/lib/domains/hostname-cache";

export const dynamic = "force-dynamic";

export async function DELETE(
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
  if (access.membership.role !== "OWNER") {
    return Response.json(
      { error: "Only an agency OWNER can remove a domain" },
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

  const result = await removeAgencyDomain({ domainId: params.domainId });
  if (!result.ok) {
    return Response.json(
      { error: result.error, code: result.code },
      { status: 502 },
    );
  }

  getDefaultHostnameCache().delete(domain.hostname);
  return Response.json({ ok: true });
}
