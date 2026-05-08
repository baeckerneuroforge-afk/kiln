import { loadWizardForAgency, requireOnboardingAccess } from "@/lib/onboarding/wizard-state";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const access = await requireOnboardingAccess();
    const wizard = await loadWizardForAgency(params.id, access.agencyOrgId);
    if (!wizard) return Response.json({ error: "Wizard not found" }, { status: 404 });
    return Response.json({
      id: wizard.id,
      status: wizard.status,
      currentStep: wizard.currentStep,
      basics: wizard.basics,
      selectedTemplates: wizard.selectedTemplates,
      knowledgeConfig: wizard.knowledgeConfig,
      channelConfig: wizard.channelConfig,
      brandingConfig: wizard.brandingConfig,
      progress: wizard.progress,
      error: wizard.error,
      result: wizard.activationResult,
      subOrgId: wizard.subOrgId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthorized" ? 401 : message.includes("required") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
