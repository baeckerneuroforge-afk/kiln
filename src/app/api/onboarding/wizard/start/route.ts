import { prisma } from "@/lib/prisma";
import {
  defaultTemplateSelection,
  jsonInput,
  parseBasics,
  requireOnboardingAccess,
} from "@/lib/onboarding/wizard-state";

function sevenDaysFromNow(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

export async function POST(request: Request) {
  try {
    const access = await requireOnboardingAccess();
    const body = await request.json().catch(() => ({}));
    const basics = parseBasics(body);
    await prisma.onboardingWizard.deleteMany({
      where: {
        agencyOrgId: access.agencyOrgId,
        status: { in: ["DRAFT", "FAILED"] },
        expiresAt: { lt: new Date() },
      },
    });
    const wizard = await prisma.onboardingWizard.create({
      data: {
        agencyOrgId: access.agencyOrgId,
        userId: access.userId,
        basics: jsonInput(basics),
        selectedTemplates: jsonInput(defaultTemplateSelection(basics.industry)),
        channelConfig: jsonInput({
          email: { enabled: true },
          whatsapp: { enabled: basics.industry === "dental" || basics.industry === "kfz" || basics.industry === "shk" },
          webchat: { enabled: true },
          voice: { enabled: basics.industry === "dental" || basics.industry === "shk" },
        }),
        expiresAt: sevenDaysFromNow(),
      },
    });
    return Response.json({ wizardId: wizard.id, wizard }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthorized" ? 401 : message.includes("required") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
