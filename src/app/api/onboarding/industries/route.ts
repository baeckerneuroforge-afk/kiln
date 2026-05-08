import { prisma } from "@/lib/prisma";
import { getIndustryOptions, toIndustryTemplateRow } from "@/lib/onboarding/industry-templates";
import { requireOnboardingAccess } from "@/lib/onboarding/wizard-state";

export async function GET() {
  try {
    await requireOnboardingAccess();
    const templates = await prisma.industryTemplate.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    if (templates.length > 0) {
      return Response.json({ industries: templates });
    }
    return Response.json({ industries: getIndustryOptions().map(toIndustryTemplateRow) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthorized" ? 401 : message.includes("required") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
