import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/auth/org-context";

// Sprint 19.6.1 — STANDALONE removed. KILN is a B2B2B agency platform,
// so every Clerk org is either an AGENCY (provisions sub-orgs) or a
// SUB_ORG (provisioned by an agency). A fresh agency org with no
// sub-orgs yet is still "AGENCY" — sub-org count is not the gate.
export type OrgMode = "AGENCY" | "SUB_ORG";

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

  // Sprint 19.6.1 — Anything that isn't a sub-org is an AGENCY, even if
  // no sub-orgs have been provisioned yet. The old STANDALONE branch
  // collapsed empty agencies into a stripped-down sidebar; that's gone.
  return "AGENCY";
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
