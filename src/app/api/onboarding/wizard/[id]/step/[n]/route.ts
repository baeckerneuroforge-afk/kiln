import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  defaultTemplateSelection,
  isOnboardingIndustry,
  jsonInput,
  loadWizardForAgency,
  parseBasics,
  requireOnboardingAccess,
} from "@/lib/onboarding/wizard-state";

export async function POST(
  request: Request,
  { params }: { params: { id: string; n: string } }
) {
  try {
    const access = await requireOnboardingAccess();
    const wizard = await loadWizardForAgency(params.id, access.agencyOrgId);
    if (!wizard) return Response.json({ error: "Wizard not found" }, { status: 404 });

    const step = Number(params.n);
    if (!Number.isInteger(step) || step < 1 || step > 6) {
      return Response.json({ error: "Invalid step" }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));

    const data: Prisma.OnboardingWizardUpdateInput = {
      currentStep: Math.min(6, Math.max(wizard.currentStep, step + 1)),
    };

    if (step === 1) {
      if (
        typeof body === "object" &&
        body !== null &&
        "industry" in body &&
        !isOnboardingIndustry((body as { industry?: unknown }).industry)
      ) {
        return Response.json({ error: "Invalid industry" }, { status: 400 });
      }
      const basics = parseBasics(body);
      data.basics = jsonInput(basics);
      data.selectedTemplates = jsonInput(defaultTemplateSelection(basics.industry));
    } else if (step === 2) {
      data.selectedTemplates = jsonInput(Array.isArray(body.templates) ? body.templates : body);
    } else if (step === 3) {
      data.knowledgeConfig = jsonInput(body);
    } else if (step === 4) {
      data.channelConfig = jsonInput(body);
    } else if (step === 5) {
      data.brandingConfig = jsonInput(body);
    }

    const updated = await prisma.onboardingWizard.update({
      where: { id: wizard.id },
      data,
    });
    return Response.json({ wizard: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthorized" ? 401 : message.includes("required") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
