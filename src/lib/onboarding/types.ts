import type { Prisma } from "@prisma/client";

export type OnboardingIndustry =
  | "dental"
  | "kfz"
  | "shk"
  | "restaurant"
  | "property"
  | "fitness"
  | "custom";

export type OnboardingChannel = "email" | "whatsapp" | "webchat" | "voice";

export interface WizardBasics {
  customerName: string;
  industry: OnboardingIndustry;
  logoUrl?: string;
  contactName?: string;
  contactEmail?: string;
  address?: string;
  customDomain?: string;
}

export interface WizardTemplateSelection {
  templateId: string;
  departmentName: string;
  selected: boolean;
}

export interface WizardKnowledgeConfig {
  files?: {
    fileName: string;
    mimeType: string;
    contentBase64?: string;
    textContent?: string;
  }[];
  urls?: string[];
  skipped?: boolean;
}

export interface WizardChannelConfig {
  email?: {
    enabled: boolean;
    inboundAddress?: string;
    outboundAddress?: string;
    setupDnsLater?: boolean;
  };
  whatsapp?: {
    enabled: boolean;
  };
  webchat?: {
    enabled: boolean;
    color?: string;
  };
  voice?: {
    enabled: boolean;
    afterHoursOnly?: boolean;
  };
}

export interface WizardBrandingConfig {
  brandColor?: string;
  logoUrl?: string;
  customSubdomain?: string;
  emailSignature?: string;
}

export interface WizardConfig {
  basics: WizardBasics;
  selectedTemplates: WizardTemplateSelection[];
  selectedAgentTemplates?: string[];
  selectedWorkflowTemplates?: string[];
  knowledge: WizardKnowledgeConfig;
  channels: WizardChannelConfig;
  branding: WizardBrandingConfig;
  wizardId?: string;
}

export interface WorkerTemplate {
  role: string;
  name: string;
  description: string;
  prompt: string;
  priority: number;
}

export interface DepartmentTemplate {
  id: string;
  name: string;
  description: string;
  defaultSelected: boolean;
  managerSystemPrompt?: string;
  managerModel?: string;
  approvalMode?: "APPROVAL_FIRST" | "AUTO" | "OFF";
  scheduleEnabled?: boolean;
  scheduleCron?: string;
  webhookEnabled?: boolean;
  useKnowledgeBase?: boolean;
  workers: WorkerTemplate[];
  operatingMemory?: Prisma.JsonObject;
  seasonal?: boolean;
  premium?: boolean;
}

export interface WhatsAppTemplateDefinition {
  name: string;
  category: "UTILITY" | "MARKETING";
  language: string;
  body: string;
  variables: string[];
  submissionNotes: string;
}

export interface VoiceScriptDefinition {
  id: string;
  title: string;
  script: string;
  routingTarget?: string;
}

export interface RecallScheduleDefinition {
  id: string;
  label: string;
  months: 3 | 6 | 12;
  dailyRunTime: string;
  cron: string;
}

export interface IndustryTemplateMetadata {
  packVersion?: string;
  setupTimeMinutes?: number;
  estimatedManualSetupHours?: number;
  whatsappTemplates?: WhatsAppTemplateDefinition[];
  voiceScripts?: VoiceScriptDefinition[];
  recallSchedules?: RecallScheduleDefinition[];
  seasonLogic?: Prisma.JsonObject;
  metaSubmissionGuide?: string[];
  notes?: string[];
}

export interface IndustryTemplateDefinition {
  industry: OnboardingIndustry;
  displayName: string;
  displayNameDe: string;
  description: string;
  descriptionDe: string;
  departmentTemplates: DepartmentTemplate[];
  knowledgeBaseSeeds: { title: string; content: string }[];
  recommendedChannels: OnboardingChannel[];
  metadata?: IndustryTemplateMetadata;
  sortOrder: number;
  iconName: string;
}

export interface OnboardingResult {
  subOrgId: string;
  relationshipId: string;
  departmentsCreated: number;
  workersCreated: number;
  kbEntriesIndexed: number;
  templateInstancesCreated?: number;
  templateInstancesReused?: number;
  channelsActivated: string[];
  durationSeconds: number;
  warnings: string[];
}

export interface WizardProgress {
  label: string;
  step: number;
  total: number;
  status: "idle" | "running" | "done" | "failed";
}
