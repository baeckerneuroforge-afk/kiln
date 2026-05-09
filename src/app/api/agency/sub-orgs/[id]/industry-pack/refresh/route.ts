import { installIndustryPack } from "@/lib/industries/shared/industry-installer";
import { requireSubOrgAccess } from "@/lib/agency/sub-org-auth";
import { isOnboardingIndustry } from "@/lib/onboarding/wizard-state";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await requireSubOrgAccess(params.id);
  if (!access.ok) return access.response;

  const industry = access.relationship.industry;
  if (!isOnboardingIndustry(industry) || industry === "custom") {
    return Response.json({ error: "This sub-org has no refreshable industry pack." }, { status: 400 });
  }

  const result = await installIndustryPack({
    industry,
    userId: access.userId,
    orgId: access.relationship.childOrgId,
    customerName: access.relationship.subOrgName,
    refreshExisting: true,
  });

  return Response.json({ result });
}
