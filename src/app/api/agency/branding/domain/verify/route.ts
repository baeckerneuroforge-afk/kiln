/**
 * POST /api/agency/branding/domain/verify — kick an immediate Vercel
 * recheck of the caller's custom domain. Useful right after the
 * operator updates DNS — saves them waiting for Vercel's background
 * poll.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canManageSubOrgs } from "@/lib/agency/permissions";
import { verifyDomain } from "@/lib/vercel/domains";

export const dynamic = "force-dynamic";

export async function POST() {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!orgId) return Response.json({ error: "No active organization." }, { status: 400 });
  if (!(await canManageSubOrgs(userId, orgId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const branding = await prisma.orgBranding.findUnique({
    where: { orgId },
    select: { customDomain: true },
  });
  if (!branding?.customDomain) {
    return Response.json(
      { error: "No custom domain configured." },
      { status: 400 }
    );
  }

  let status;
  try {
    status = await verifyDomain(branding.customDomain);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verify failed";
    return Response.json({ error: msg }, { status: 502 });
  }

  if (status.verified) {
    await prisma.orgBranding.update({
      where: { orgId },
      data: { domainVerified: true, domainVerifiedAt: new Date() },
    });
  }

  return Response.json({
    domain: branding.customDomain,
    verified: status.verified,
    verification: status.verification,
  });
}
