import { auth } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageSubOrgs } from "@/lib/agency/permissions";
import { getIndustryTemplate } from "@/lib/onboarding/industry-templates";
import type {
  OnboardingIndustry,
  WizardBasics,
  WizardBrandingConfig,
  WizardChannelConfig,
  WizardConfig,
  WizardKnowledgeConfig,
  WizardTemplateSelection,
} from "@/lib/onboarding/types";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isOnboardingIndustry(value: unknown): value is OnboardingIndustry {
  return (
    value === "dental" ||
    value === "kfz" ||
    value === "shk" ||
    value === "restaurant" ||
    value === "property" ||
    value === "fitness" ||
    value === "custom"
  );
}

export async function requireOnboardingAccess(): Promise<{ userId: string; agencyOrgId: string }> {
  const result = await auth();
  const userId = result.userId;
  const agencyOrgId = result.orgId;
  if (!userId) throw new Error("Unauthorized");
  if (!agencyOrgId) throw new Error("No active organization");

  const role = isRecord(result) && typeof result.orgRole === "string" ? result.orgRole : null;
  const roleAllows = role === "AGENCY_OWNER" || role === "org:admin" || role === "admin";
  const canManage = await canManageSubOrgs(userId, agencyOrgId);
  if (!roleAllows && !canManage) throw new Error("Agency owner access required");

  return { userId, agencyOrgId };
}

export function parseBasics(value: unknown): WizardBasics {
  const input = isRecord(value) ? value : {};
  const industry = isOnboardingIndustry(input.industry) ? input.industry : "custom";
  return {
    customerName: asString(input.customerName) ?? asString(input.name) ?? "",
    industry,
    logoUrl: asString(input.logoUrl),
    contactName: asString(input.contactName),
    contactEmail: asString(input.contactEmail),
    address: asString(input.address),
    customDomain: asString(input.customDomain),
  };
}

export function defaultTemplateSelection(industry: OnboardingIndustry): WizardTemplateSelection[] {
  const template = getIndustryTemplate(industry);
  return (template?.departmentTemplates ?? []).map((department) => ({
    templateId: department.id,
    departmentName: department.name,
    selected: department.defaultSelected,
  }));
}

export function parseTemplateSelection(value: unknown, industry: OnboardingIndustry): WizardTemplateSelection[] {
  if (!Array.isArray(value)) return defaultTemplateSelection(industry);
  return value
    .filter(isRecord)
    .map((item) => ({
      templateId: asString(item.templateId) ?? "",
      departmentName: asString(item.departmentName) ?? asString(item.templateId) ?? "",
      selected: item.selected !== false,
    }))
    .filter((item) => item.templateId);
}

export function parseTemplateIdSelection(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))
  );
}

export function parseKnowledgeConfig(value: unknown): WizardKnowledgeConfig {
  const input = isRecord(value) ? value : {};
  const urls = Array.isArray(input.urls) ? input.urls.filter((url): url is string => typeof url === "string") : [];
  const files = Array.isArray(input.files)
    ? input.files.filter(isRecord).map((file) => ({
        fileName: asString(file.fileName) ?? "upload.pdf",
        mimeType: asString(file.mimeType) ?? "application/pdf",
        contentBase64: asString(file.contentBase64),
        textContent: asString(file.textContent),
      }))
    : [];
  return {
    urls,
    files,
    skipped: input.skipped === true,
  };
}

export function parseChannelConfig(value: unknown): WizardChannelConfig {
  const input = isRecord(value) ? value : {};
  const email = isRecord(input.email) ? input.email : {};
  const whatsapp = isRecord(input.whatsapp) ? input.whatsapp : {};
  const webchat = isRecord(input.webchat) ? input.webchat : {};
  const voice = isRecord(input.voice) ? input.voice : {};
  return {
    email: {
      enabled: email.enabled !== false,
      inboundAddress: asString(email.inboundAddress),
      outboundAddress: asString(email.outboundAddress),
      setupDnsLater: email.setupDnsLater === true,
    },
    whatsapp: { enabled: whatsapp.enabled === true },
    webchat: { enabled: webchat.enabled !== false, color: asString(webchat.color) },
    voice: { enabled: voice.enabled === true, afterHoursOnly: voice.afterHoursOnly === true },
  };
}

export function parseBrandingConfig(value: unknown): WizardBrandingConfig {
  const input = isRecord(value) ? value : {};
  return {
    brandColor: asString(input.brandColor),
    logoUrl: asString(input.logoUrl),
    customSubdomain: asString(input.customSubdomain),
    emailSignature: asString(input.emailSignature),
  };
}

export function wizardToConfig(wizard: {
  id: string;
  basics: Prisma.JsonValue;
  selectedTemplates: Prisma.JsonValue;
  selectedAgentTemplates?: Prisma.JsonValue;
  selectedWorkflowTemplates?: Prisma.JsonValue;
  knowledgeConfig: Prisma.JsonValue;
  channelConfig: Prisma.JsonValue;
  brandingConfig: Prisma.JsonValue;
}): WizardConfig {
  const basics = parseBasics(wizard.basics);
  return {
    wizardId: wizard.id,
    basics,
    selectedTemplates: parseTemplateSelection(wizard.selectedTemplates, basics.industry),
    selectedAgentTemplates: parseTemplateIdSelection(wizard.selectedAgentTemplates),
    selectedWorkflowTemplates: parseTemplateIdSelection(wizard.selectedWorkflowTemplates),
    knowledge: parseKnowledgeConfig(wizard.knowledgeConfig),
    channels: parseChannelConfig(wizard.channelConfig),
    branding: parseBrandingConfig(wizard.brandingConfig),
  };
}

export async function loadWizardForAgency(id: string, agencyOrgId: string) {
  return prisma.onboardingWizard.findFirst({
    where: { id, agencyOrgId },
  });
}

export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
