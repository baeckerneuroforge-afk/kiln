/**
 * GET  /api/agency/sub-orgs/[id]/branding — read sub-org branding row
 * PATCH /api/agency/sub-orgs/[id]/branding — update logo / primary
 *        color / show-agency-logo flag.
 *
 * Custom-domain configuration goes through the existing
 * /api/agency/branding/domain/* routes — those operate on the
 * caller's *active* org, so the agency owner uses the dedicated
 * "Login as client" flow + the standard branding page when they need
 * to set up a sub-org's domain. We surface the read-side here so the
 * detail page's Branding tab can show what's currently configured.
 *
 * Auth: see @/lib/agency/sub-org-auth.
 */
import { prisma } from "@/lib/prisma";
import { requireSubOrgAccess } from "@/lib/agency/sub-org-auth";
// Sprint 20.1 — PATCH (branding-write) requires OWNER/ADMIN; GET keeps
// requireSubOrgAccess so assigned CONSULTANT/VIEWER can read.
import { requireAgencyMutation } from "@/lib/agency/require-agency-mutation";

export const dynamic = "force-dynamic";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const HTTPS_URL_RE = /^https:\/\/[^\s<>"]+$/;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await requireSubOrgAccess(params.id);
  if (!access.ok) return access.response;
  const orgId = access.relationship.childOrgId;

  const branding = await prisma.orgBranding.findUnique({
    where: { orgId },
    select: {
      logoUrl: true,
      primaryColor: true,
      showAgencyLogo: true,
      agencyName: true,
      customDomain: true,
      domainVerified: true,
      domainVerifiedAt: true,
    },
  });

  return Response.json({
    logoUrl: branding?.logoUrl ?? null,
    primaryColor: branding?.primaryColor ?? null,
    showAgencyLogo: branding?.showAgencyLogo ?? true,
    agencyName: branding?.agencyName ?? null,
    customDomain: branding?.customDomain ?? null,
    domainVerified: branding?.domainVerified ?? false,
    domainVerifiedAt: branding?.domainVerifiedAt?.toISOString() ?? null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const access = await requireAgencyMutation(params.id);
  if (!access.ok) return access.response;
  const orgId = access.relationship.childOrgId;

  const body = (await request.json().catch(() => ({}))) as {
    logoUrl?: unknown;
    primaryColor?: unknown;
    showAgencyLogo?: unknown;
  };

  const data: {
    logoUrl?: string | null;
    primaryColor?: string | null;
    showAgencyLogo?: boolean;
  } = {};

  if (body.logoUrl !== undefined) {
    if (body.logoUrl === null || body.logoUrl === "") {
      data.logoUrl = null;
    } else if (typeof body.logoUrl === "string" && HTTPS_URL_RE.test(body.logoUrl)) {
      data.logoUrl = body.logoUrl;
    } else {
      return Response.json(
        { error: "logoUrl must be a valid https URL" },
        { status: 400 },
      );
    }
  }
  if (body.primaryColor !== undefined) {
    if (body.primaryColor === null || body.primaryColor === "") {
      data.primaryColor = null;
    } else if (typeof body.primaryColor === "string" && HEX_RE.test(body.primaryColor)) {
      data.primaryColor = body.primaryColor;
    } else {
      return Response.json(
        { error: "primaryColor must be a 6-digit hex like #F97316" },
        { status: 400 },
      );
    }
  }
  if (typeof body.showAgencyLogo === "boolean") {
    data.showAgencyLogo = body.showAgencyLogo;
  }

  const updated = await prisma.orgBranding.upsert({
    where: { orgId },
    create: { orgId, ...data },
    update: data,
  });

  return Response.json({
    logoUrl: updated.logoUrl,
    primaryColor: updated.primaryColor,
    showAgencyLogo: updated.showAgencyLogo,
    agencyName: updated.agencyName,
    customDomain: updated.customDomain,
    domainVerified: updated.domainVerified,
  });
}
