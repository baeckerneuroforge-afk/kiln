/**
 * GET /api/agency/branding/domain/status — poll the live status of the
 * caller's custom domain.
 *
 * Returns the Vercel-side flags (verified, ssl, verification records,
 * error) plus the locally-persisted domainVerified flag. The two should
 * agree; when Vercel reports verified=true and our DB still says false,
 * we sync the DB so the next page load reflects the real state.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canManageSubOrgs } from "@/lib/agency/permissions";
import { getDomainStatus } from "@/lib/vercel/domains";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return Response.json({ error: "No active organization." }, { status: 400 });
  if (!(await canManageSubOrgs(userId, orgId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const branding = await prisma.orgBranding.findUnique({
    where: { orgId },
    select: { customDomain: true, domainVerified: true },
  });
  if (!branding?.customDomain) {
    return Response.json({ domain: null });
  }

  let status;
  try {
    status = await getDomainStatus(branding.customDomain);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Vercel API error";
    return Response.json(
      {
        domain: branding.customDomain,
        verified: branding.domainVerified,
        ssl: false,
        verification: [],
        error: msg,
      },
      { status: 502 }
    );
  }

  // Sync the DB if Vercel reports verified-and-SSL but our flag is
  // stale. The reverse direction (Vercel says no, DB says yes) is also
  // synced so the row never overstates verification.
  const shouldBeVerified = status.verified && status.ssl;
  if (shouldBeVerified !== branding.domainVerified) {
    await prisma.orgBranding.update({
      where: { orgId },
      data: {
        domainVerified: shouldBeVerified,
        domainVerifiedAt: shouldBeVerified ? new Date() : null,
      },
    });
  }

  return Response.json({
    domain: branding.customDomain,
    verified: shouldBeVerified,
    ssl: status.ssl,
    verification: status.verification,
    error: status.error,
  });
}
