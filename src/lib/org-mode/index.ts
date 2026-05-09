import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/auth/org-context";

export type OrgMode = "AGENCY" | "SUB_ORG" | "STANDALONE";

export type OrgModeDetails = {
  mode: OrgMode;
  orgId: string;
  parentOrgId: string | null;
  subOrgName: string | null;
  brandColor: string | null;
  logoUrl: string | null;
};

export const AGENCY_ONLY_PATHS = [
  "/dashboard/agency",
  "/dashboard/operations",
  "/dashboard/admin/industry-packs",
  "/dashboard/onboarding",
  "/dashboard/templates",
] as const;

export async function getOrgMode(orgId: string): Promise<OrgMode> {
  const asSubOrg = await prisma.orgRelationship.findFirst({
    where: { childOrgId: orgId },
    select: { id: true },
  });
  if (asSubOrg) return "SUB_ORG";

  const hasSubOrgs = await prisma.orgRelationship.findFirst({
    where: { parentOrgId: orgId },
    select: { id: true },
  });
  if (hasSubOrgs) return "AGENCY";

  return "STANDALONE";
}

export async function getOrgModeDetails(orgId: string): Promise<OrgModeDetails> {
  const asSubOrg = await prisma.orgRelationship.findFirst({
    where: { childOrgId: orgId },
    select: {
      parentOrgId: true,
      subOrgName: true,
      brandColor: true,
      logoUrl: true,
    },
  });

  if (asSubOrg) {
    return {
      mode: "SUB_ORG",
      orgId,
      parentOrgId: asSubOrg.parentOrgId,
      subOrgName: asSubOrg.subOrgName,
      brandColor: asSubOrg.brandColor,
      logoUrl: asSubOrg.logoUrl,
    };
  }

  return {
    mode: await getOrgMode(orgId),
    orgId,
    parentOrgId: null,
    subOrgName: null,
    brandColor: null,
    logoUrl: null,
  };
}

export function isAgencyOnlyPath(pathname: string): boolean {
  return AGENCY_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function requireAgencyMode(): Promise<{ userId: string; orgId: string; mode: OrgMode }> {
  const scope = await requireOrgId();
  const mode = await getOrgMode(scope.orgId);
  if (mode === "SUB_ORG") {
    redirect("/dashboard");
  }
  return { ...scope, mode };
}
