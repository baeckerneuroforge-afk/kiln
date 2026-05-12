import { clerkClient } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canCreateSubOrg } from "@/lib/agency/permissions";
import { addOwnerMembership, subOrgMetadata } from "@/lib/sub-org/provision";
import { applySubOrgBranding } from "@/lib/onboarding/branding-applier";
import { setupOnboardingChannels } from "@/lib/onboarding/channel-setup";
import { installIndustryPack } from "@/lib/industries/shared/industry-installer";
import { importKnowledgeForSubOrg } from "@/lib/onboarding/kb-bulk-import";
import { installSelectedTemplatesForSubOrg } from "@/lib/templates/service";
import type {
  OnboardingResult,
  WizardConfig,
  WizardProgress,
} from "@/lib/onboarding/types";

async function setWizardProgress(wizardId: string | undefined, progress: WizardProgress): Promise<void> {
  if (!wizardId) return;
  await prisma.onboardingWizard.update({
    where: { id: wizardId },
    data: {
      status: progress.status === "failed" ? "FAILED" : "ACTIVATING",
      progress: progress as unknown as Prisma.InputJsonValue,
    },
  });
}

async function findAvailableCustomerName(agencyOrgId: string, requestedName: string): Promise<{ name: string; warning?: string }> {
  const existing = await prisma.orgRelationship.findMany({
    where: {
      parentOrgId: agencyOrgId,
      subOrgName: { startsWith: requestedName },
    },
    select: { subOrgName: true },
  });
  const names = new Set(existing.map((item) => item.subOrgName.toLowerCase()));
  if (!names.has(requestedName.toLowerCase())) return { name: requestedName };
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${requestedName} (${i})`;
    if (!names.has(candidate.toLowerCase())) {
      return {
        name: candidate,
        warning: `Customer name already existed. Created "${candidate}" instead.`,
      };
    }
  }
  return {
    name: `${requestedName} ${Date.now()}`,
    warning: "Customer name conflict detected. A timestamp was appended.",
  };
}

async function sendWelcomeEmail(config: WizardConfig, childOrgId: string): Promise<string | null> {
  const to = config.basics.contactEmail;
  if (!to) return "No customer-owner email provided; welcome email skipped.";
  if (!process.env.RESEND_API_KEY) return "RESEND_API_KEY is not configured; welcome email skipped.";

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "KILN <onboarding@kilnbase.com>",
      to,
      subject: `Welcome to ${config.basics.customerName}`,
      text: `Your KILN workspace is ready.\n\nWorkspace ID: ${childOrgId}\n\nYou will receive login details from your agency owner.`,
    });
    return null;
  } catch (err) {
    return `Welcome email failed: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}

export async function executeOnboardingWizard(args: {
  agencyOrgId: string;
  userId: string;
  config: WizardConfig;
}): Promise<OnboardingResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const totalSteps = 7;

  try {
    await setWizardProgress(args.config.wizardId, { label: "Checking agency permissions", step: 1, total: totalSteps, status: "running" });
    const decision = await canCreateSubOrg(args.userId, args.agencyOrgId);
    if (!decision.allowed) {
      throw new Error("User cannot create customer workspaces for this agency.");
    }

    const customerName = args.config.basics.customerName.trim();
    if (!customerName) throw new Error("Customer name is required.");
    const nameChoice = await findAvailableCustomerName(args.agencyOrgId, customerName);
    if (nameChoice.warning) warnings.push(nameChoice.warning);

    await setWizardProgress(args.config.wizardId, { label: "Creating Sub-Org", step: 2, total: totalSteps, status: "running" });
    const client = await clerkClient();
    const newOrg = await client.organizations.createOrganization({
      name: nameChoice.name,
      createdBy: args.userId,
      publicMetadata: subOrgMetadata(args.agencyOrgId),
    });

    const relationship = await prisma.orgRelationship.create({
      data: {
        parentOrgId: args.agencyOrgId,
        childOrgId: newOrg.id,
        createdBy: args.userId,
        subOrgName: nameChoice.name,
        industry: args.config.basics.industry,
        onboardedVia: "WIZARD",
        brandColor: args.config.branding.brandColor,
        logoUrl: args.config.branding.logoUrl || args.config.basics.logoUrl,
        customSubdomain: args.config.branding.customSubdomain || args.config.basics.customDomain,
        emailSignature: args.config.branding.emailSignature,
      },
    });

    await addOwnerMembership({ subOrgId: relationship.id, userId: args.userId });

    await setWizardProgress(args.config.wizardId, { label: "Creating Departments and Worker Agents", step: 3, total: totalSteps, status: "running" });
    const selectedTemplateIds = args.config.selectedTemplates
      .filter((template) => template.selected)
      .map((template) => template.templateId);
    const installed = await installIndustryPack({
      industry: args.config.basics.industry,
      userId: args.userId,
      orgId: newOrg.id,
      customerName: nameChoice.name,
      selectedTemplateIds,
    });
    warnings.push(...installed.warnings);

    await setWizardProgress(args.config.wizardId, { label: "Installing Agency Templates", step: 4, total: totalSteps, status: "running" });
    const installedTemplates = await installSelectedTemplatesForSubOrg({
      agencyOrgId: args.agencyOrgId,
      subOrgId: newOrg.id,
      userId: args.userId,
      agentTemplateIds: args.config.selectedAgentTemplates ?? [],
      workflowTemplateIds: args.config.selectedWorkflowTemplates ?? [],
    });

    await setWizardProgress(args.config.wizardId, { label: "Indexing Uploaded Knowledge", step: 5, total: totalSteps, status: "running" });
    const kbResult = await importKnowledgeForSubOrg({
      orgId: newOrg.id,
      config: args.config.knowledge,
      seedEntries: [],
    });
    warnings.push(...kbResult.warnings);

    await setWizardProgress(args.config.wizardId, { label: "Applying Branding", step: 6, total: totalSteps, status: "running" });
    await applySubOrgBranding({
      relationshipId: relationship.id,
      childOrgId: newOrg.id,
      basics: { ...args.config.basics, customerName: nameChoice.name },
      branding: args.config.branding,
    });

    await setWizardProgress(args.config.wizardId, { label: "Activating Channels", step: 7, total: totalSteps, status: "running" });
    const channels = await setupOnboardingChannels({
      departmentIds: installed.departmentIds,
      basics: { ...args.config.basics, customerName: nameChoice.name },
      channels: args.config.channels,
      branding: args.config.branding,
    });
    warnings.push(...channels.warnings);

    const welcomeWarning = await sendWelcomeEmail(args.config, newOrg.id);
    if (welcomeWarning) warnings.push(welcomeWarning);

    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const result: OnboardingResult = {
      subOrgId: newOrg.id,
      relationshipId: relationship.id,
      departmentsCreated: installed.departmentsCreated,
      workersCreated: installed.workersCreated,
      kbEntriesIndexed: installed.kbEntriesIndexed + kbResult.indexed,
      templateInstancesCreated: installedTemplates.createdInstances,
      templateInstancesReused: installedTemplates.reusedInstances,
      channelsActivated: channels.activated,
      durationSeconds,
      warnings,
    };

    await prisma.orgRelationship.update({
      where: { id: relationship.id },
      data: {
        onboardingDuration: durationSeconds,
        onboardedAt: new Date(),
      },
    });

    if (args.config.wizardId) {
      await prisma.onboardingWizard.update({
        where: { id: args.config.wizardId },
        data: {
          status: "ACTIVE",
          currentStep: 6,
          subOrgId: newOrg.id,
          activatedAt: new Date(),
          activationResult: result as unknown as Prisma.InputJsonValue,
          progress: { label: "Done", step: totalSteps, total: totalSteps, status: "done" } satisfies Prisma.InputJsonValue,
        },
      });
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onboarding activation failed";
    if (args.config.wizardId) {
      await prisma.onboardingWizard.update({
        where: { id: args.config.wizardId },
        data: {
          status: "FAILED",
          error: message,
          progress: { label: message, step: totalSteps, total: totalSteps, status: "failed" } satisfies Prisma.InputJsonValue,
        },
      });
    }
    throw err;
  }
}
