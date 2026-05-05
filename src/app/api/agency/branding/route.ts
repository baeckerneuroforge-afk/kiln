/**
 * GET   /api/agency/branding — load branding for the active org. If the
 *                              active org is a sub-org we return the
 *                              parent agency's branding so the client
 *                              workspace renders the agency's logo.
 * PATCH /api/agency/branding — upsert branding for the active org. Only
 *                              callable from an agency-tier org (sub-orgs
 *                              don't override their parent's brand).
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canManageSubOrgs } from "@/lib/agency/permissions";

export const dynamic = "force-dynamic";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function noActiveOrg() {
  return Response.json(
    { error: "No active organization." },
    { status: 400 }
  );
}

/**
 * Resolves the "branding org" for the current active org:
 * - if the active org is a sub-org with an agency parent, returns the
 *   parent's orgId (so sub-orgs inherit branding);
 * - otherwise returns the active orgId itself.
 */
async function resolveBrandingOrgId(activeOrgId: string): Promise<string> {
  const link = await prisma.orgRelationship.findFirst({
    where: { childOrgId: activeOrgId, subOrgStatus: { not: "ARCHIVED" } },
    select: { parentOrgId: true },
  });
  return link?.parentOrgId ?? activeOrgId;
}

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return unauthorized();
  if (!orgId) return noActiveOrg();

  const brandingOrgId = await resolveBrandingOrgId(orgId);
  const branding = await prisma.orgBranding.findUnique({
    where: { orgId: brandingOrgId },
  });

  return Response.json({
    orgId: brandingOrgId,
    isInherited: brandingOrgId !== orgId,
    branding: branding
      ? {
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          showAgencyLogo: branding.showAgencyLogo,
          agencyName: branding.agencyName,
        }
      : null,
  });
}

export async function PATCH(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return unauthorized();
  if (!orgId) return noActiveOrg();

  // Only agency-tier orgs may write branding. Sub-orgs inherit their
  // parent's row and have no independent brand.
  const allowed = await canManageSubOrgs(userId, orgId);
  if (!allowed) {
    return Response.json(
      { error: "Branding management requires AGENCY tier or higher." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    logoUrl?: unknown;
    primaryColor?: unknown;
    showAgencyLogo?: unknown;
    agencyName?: unknown;
  };

  const update: {
    logoUrl?: string | null;
    primaryColor?: string | null;
    showAgencyLogo?: boolean;
    agencyName?: string | null;
  } = {};

  if (body.logoUrl === null || typeof body.logoUrl === "string") {
    update.logoUrl = body.logoUrl as string | null;
  }
  if (body.primaryColor === null || typeof body.primaryColor === "string") {
    if (
      typeof body.primaryColor === "string" &&
      body.primaryColor.length > 0 &&
      !HEX_COLOR_RE.test(body.primaryColor)
    ) {
      return Response.json(
        { error: "primaryColor must be a 6-digit hex like #F97316" },
        { status: 400 }
      );
    }
    update.primaryColor = body.primaryColor as string | null;
  }
  if (typeof body.showAgencyLogo === "boolean") {
    update.showAgencyLogo = body.showAgencyLogo;
  }
  if (body.agencyName === null || typeof body.agencyName === "string") {
    update.agencyName = body.agencyName as string | null;
  }

  const branding = await prisma.orgBranding.upsert({
    where: { orgId },
    update,
    create: {
      orgId,
      logoUrl: update.logoUrl ?? null,
      primaryColor: update.primaryColor ?? null,
      showAgencyLogo: update.showAgencyLogo ?? true,
      agencyName: update.agencyName ?? null,
    },
  });

  return Response.json({
    branding: {
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor,
      showAgencyLogo: branding.showAgencyLogo,
      agencyName: branding.agencyName,
    },
  });
}
