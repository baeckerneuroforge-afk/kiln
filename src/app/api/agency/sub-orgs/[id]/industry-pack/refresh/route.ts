import { installIndustryPack } from "@/lib/industries/shared/industry-installer";
// Sprint 20.1 — refreshing an industry-pack rewrites agents + knowledge;
// gate to OWNER/ADMIN.
import { requireAgencyMutation } from "@/lib/agency/require-agency-mutation";
import { isOnboardingIndustry } from "@/lib/onboarding/wizard-state";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await requireAgencyMutation(params.id);
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
