import { prisma } from "@/lib/prisma";
import type { WizardBrandingConfig, WizardBasics } from "@/lib/onboarding/types";

export async function applySubOrgBranding(args: {
  relationshipId: string;
  childOrgId: string;
  basics: WizardBasics;
  branding: WizardBrandingConfig;
}): Promise<void> {
  const brandColor = args.branding.brandColor || "#F97316";
  const logoUrl = args.branding.logoUrl || args.basics.logoUrl || null;
  const customSubdomain = args.branding.customSubdomain || args.basics.customDomain || null;
  const emailSignature =
    args.branding.emailSignature ||
    `${args.basics.customerName}\n${args.basics.contactName ?? ""}`.trim();

  await prisma.$transaction([
    prisma.orgRelationship.update({
      where: { id: args.relationshipId },
      data: {
        brandColor,
        logoUrl,
        customSubdomain,
        emailSignature,
      },
    }),
    prisma.orgBranding.upsert({
      where: { orgId: args.childOrgId },
      update: {
        logoUrl,
        primaryColor: brandColor,
        customDomain: customSubdomain,
        agencyName: args.basics.customerName,
        emailSignature,
      },
      create: {
        orgId: args.childOrgId,
        logoUrl,
        primaryColor: brandColor,
        customDomain: customSubdomain,
        agencyName: args.basics.customerName,
        emailSignature,
      },
    }),
  ]);
}
