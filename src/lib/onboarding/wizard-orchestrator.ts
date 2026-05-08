import { clerkClient } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canCreateSubOrg } from "@/lib/agency/permissions";
import { applySubOrgBranding } from "@/lib/onboarding/branding-applier";
import { setupOnboardingChannels } from "@/lib/onboarding/channel-setup";
import { getIndustryTemplate } from "@/lib/onboarding/industry-templates";
import { importKnowledgeForSubOrg } from "@/lib/onboarding/kb-bulk-import";
import type {
  DepartmentTemplate,
  OnboardingResult,
  WizardConfig,
  WizardProgress,
} from "@/lib/onboarding/types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

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

function selectedDepartmentTemplates(config: WizardConfig): DepartmentTemplate[] {
  const template = getIndustryTemplate(config.basics.industry);
  if (!template) return [];
  const selections = new Map(config.selectedTemplates.map((item) => [item.templateId, item.selected]));
  return template.departmentTemplates.filter((department) => selections.get(department.id) ?? department.defaultSelected);
}

async function createDepartmentsAndWorkers(args: {
  userId: string;
  childOrgId: string;
  customerName: string;
  departments: DepartmentTemplate[];
}): Promise<{ departmentIds: string[]; departmentsCreated: number; workersCreated: number }> {
  const slugSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let workersCreated = 0;
  const departmentIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const template of args.departments) {
      const department = await tx.department.create({
        data: {
          userId: args.userId,
          orgId: args.childOrgId,
          name: template.name,
          description: template.description,
          type: "CUSTOM",
          status: "ACTIVE",
          approvalMode: "APPROVAL_FIRST",
          managerModel: "claude-sonnet-4-6",
          managerSystemPrompt: `You manage ${template.name} for ${args.customerName}. Route tasks to the right worker, draft customer-facing actions, and use approval-first mode for outbound communication.`,
          webhookEnabled: true,
          scheduleEnabled: false,
          operatingMemory: {
            onboardingTemplateId: template.id,
            customerName: args.customerName,
            recentEvents: [],
          } satisfies Prisma.InputJsonValue,
        },
      });
      departmentIds.push(department.id);

      for (const worker of template.workers) {
        const agent = await tx.agent.create({
          data: {
            userId: args.userId,
            orgId: args.childOrgId,
            name: worker.name,
            slug: `${slugify(worker.role)}-${slugify(args.customerName)}-${slugSuffix}`,
            description: worker.description,
            systemPrompt: worker.prompt,
            mode: "TASK",
            status: "DRAFT",
            visibility: "INTERNAL",
            llmModel: "claude-sonnet-4-6",
            modelProvider: "ANTHROPIC",
            suggestedQuestions: [],
            a2aCapabilities: [],
          },
        });
        await tx.departmentWorker.create({
          data: {
            departmentId: department.id,
            agentId: agent.id,
            role: worker.role,
            description: worker.description,
            priority: worker.priority,
          },
        });
        workersCreated += 1;
      }
    }
  });

  return {
    departmentIds,
    departmentsCreated: departmentIds.length,
    workersCreated,
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

    await setWizardProgress(args.config.wizardId, { label: "Creating Departments and Worker Agents", step: 3, total: totalSteps, status: "running" });
    const departments = selectedDepartmentTemplates(args.config);
    const created = await createDepartmentsAndWorkers({
      userId: args.userId,
      childOrgId: newOrg.id,
      customerName: nameChoice.name,
      departments,
    });

    await setWizardProgress(args.config.wizardId, { label: "Indexing Knowledge Base", step: 4, total: totalSteps, status: "running" });
    const industryTemplate = getIndustryTemplate(args.config.basics.industry);
    const kbResult = await importKnowledgeForSubOrg({
      orgId: newOrg.id,
      config: args.config.knowledge,
      seedEntries: industryTemplate?.knowledgeBaseSeeds ?? [],
    });
    warnings.push(...kbResult.warnings);

    await setWizardProgress(args.config.wizardId, { label: "Applying Branding", step: 5, total: totalSteps, status: "running" });
    await applySubOrgBranding({
      relationshipId: relationship.id,
      childOrgId: newOrg.id,
      basics: { ...args.config.basics, customerName: nameChoice.name },
      branding: args.config.branding,
    });

    await setWizardProgress(args.config.wizardId, { label: "Activating Channels", step: 6, total: totalSteps, status: "running" });
    const channels = await setupOnboardingChannels({
      departmentIds: created.departmentIds,
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
      departmentsCreated: created.departmentsCreated,
      workersCreated: created.workersCreated,
      kbEntriesIndexed: kbResult.indexed,
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
