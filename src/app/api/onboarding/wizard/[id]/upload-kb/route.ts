import { prisma } from "@/lib/prisma";
import { jsonInput, loadWizardForAgency, parseKnowledgeConfig, requireOnboardingAccess } from "@/lib/onboarding/wizard-state";

async function parsePayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return request.json().catch(() => ({}));
  }
  const form = await request.formData();
  const urls = form.getAll("url").filter((value): value is string => typeof value === "string");
  const files = await Promise.all(
    form.getAll("file").filter((value): value is File => value instanceof File).map(async (file) => ({
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      contentBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    }))
  );
  return { urls, files };
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const access = await requireOnboardingAccess();
    const wizard = await loadWizardForAgency(params.id, access.agencyOrgId);
    if (!wizard) return Response.json({ error: "Wizard not found" }, { status: 404 });
    const payload = await parsePayload(request);
    const config = parseKnowledgeConfig(payload);
    const updated = await prisma.onboardingWizard.update({
      where: { id: wizard.id },
      data: {
        currentStep: Math.max(wizard.currentStep, 4),
        knowledgeConfig: jsonInput(config),
      },
    });
    return Response.json({ wizard: updated, files: config.files?.length ?? 0, urls: config.urls?.length ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthorized" ? 401 : message.includes("required") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
