import { prisma } from "@/lib/prisma";
import { executeOnboardingWizard } from "@/lib/onboarding/wizard-orchestrator";
import { loadWizardForAgency, requireOnboardingAccess, wizardToConfig } from "@/lib/onboarding/wizard-state";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const access = await requireOnboardingAccess();
    const wizard = await loadWizardForAgency(params.id, access.agencyOrgId);
    if (!wizard) return Response.json({ error: "Wizard not found" }, { status: 404 });
    await prisma.onboardingWizard.update({
      where: { id: wizard.id },
      data: { status: "ACTIVATING", error: null },
    });
    const result = await executeOnboardingWizard({
      agencyOrgId: access.agencyOrgId,
      userId: access.userId,
      config: wizardToConfig(wizard),
    });
    return Response.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Activation failed";
    const status = message === "Unauthorized" ? 401 : message.includes("required") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
