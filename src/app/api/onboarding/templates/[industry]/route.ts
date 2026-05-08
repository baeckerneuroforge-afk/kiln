import { getIndustryTemplate, toIndustryTemplateRow } from "@/lib/onboarding/industry-templates";
import { prisma } from "@/lib/prisma";
import { requireOnboardingAccess, isOnboardingIndustry } from "@/lib/onboarding/wizard-state";

export async function GET(
  _request: Request,
  { params }: { params: { industry: string } }
) {
  try {
    await requireOnboardingAccess();
    if (!isOnboardingIndustry(params.industry)) {
      return Response.json({ error: "Unknown industry" }, { status: 404 });
    }
    const row = await prisma.industryTemplate.findUnique({
      where: { industry: params.industry },
    });
    if (row) return Response.json(row);
    const template = getIndustryTemplate(params.industry);
    if (!template) return Response.json({ error: "Unknown industry" }, { status: 404 });
    return Response.json(toIndustryTemplateRow(template));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthorized" ? 401 : message.includes("required") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
