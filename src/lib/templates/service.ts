import {
  AgentMode,
  AgentStatus,
  AgentTeamStatus,
  AgentVisibility,
  ModelProvider,
  Prisma,
  TriggerType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AgentTemplateConfig,
  TemplateInstallResult,
  TemplatePushResult,
  TemplateType,
  WorkflowTemplateConfig,
} from "@/lib/templates/types";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === null) return Prisma.JsonNull;
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function enumValue<T extends Record<string, string>>(record: T, value: unknown, fallback: T[keyof T]): T[keyof T] {
  return typeof value === "string" && Object.values(record).includes(value) ? (value as T[keyof T]) : fallback;
}

function agentConfigFromJson(value: Prisma.JsonValue): AgentTemplateConfig {
  const record = isRecord(value) ? value : {};
  return {
    name: asString(record.name, "Template Agent"),
    description: asOptionalString(record.description),
    systemPrompt: asString(record.systemPrompt, "Du bist ein hilfreicher Assistent."),
    personality: (record.personality ?? null) as Prisma.JsonValue | null,
    welcomeMessage: asOptionalString(record.welcomeMessage),
    suggestedQuestions: asStringArray(record.suggestedQuestions),
    llmModel: asString(record.llmModel, "claude-sonnet-4-6"),
    temperature: asNumber(record.temperature, 0.7),
    modelProvider: asString(record.modelProvider, ModelProvider.ANTHROPIC),
    status: asString(record.status, AgentStatus.DRAFT),
    visibility: asString(record.visibility, AgentVisibility.PUBLIC),
    mode: asString(record.mode, AgentMode.CHAT),
    triggerType: asString(record.triggerType, TriggerType.MANUAL),
    triggerConfig: (record.triggerConfig ?? null) as Prisma.JsonValue | null,
    inputSchema: (record.inputSchema ?? null) as Prisma.JsonValue | null,
    outputSchema: (record.outputSchema ?? null) as Prisma.JsonValue | null,
    strictOutputValidation: asBoolean(record.strictOutputValidation, false),
    approvalMode: asString(record.approvalMode, "none"),
    approvalConfig: (record.approvalConfig ?? null) as Prisma.JsonValue | null,
    whiteLabel: (record.whiteLabel ?? null) as Prisma.JsonValue | null,
    autoDetectLanguage: asBoolean(record.autoDetectLanguage, true),
    memoryEnabled: asBoolean(record.memoryEnabled, false),
    visitorMemoryEnabled: asBoolean(record.visitorMemoryEnabled, true),
    imageAnalysisEnabled: asBoolean(record.imageAnalysisEnabled, false),
    imageAutoActions: asBoolean(record.imageAutoActions, false),
    showAiDisclaimer: asBoolean(record.showAiDisclaimer, true),
    promptBranches: (record.promptBranches ?? null) as Prisma.JsonValue | null,
    enableAgenticRag: asBoolean(record.enableAgenticRag, false),
    agenticRagAutoApprove: asBoolean(record.agenticRagAutoApprove, false),
    agenticRagMinConfidence: asNumber(record.agenticRagMinConfidence, 90),
    a2aEnabled: asBoolean(record.a2aEnabled, false),
    a2aCapabilities: asStringArray(record.a2aCapabilities),
    codeExecutionEnabled: asBoolean(record.codeExecutionEnabled, false),
  };
}

function workflowConfigFromJson(value: Prisma.JsonValue): WorkflowTemplateConfig {
  const record = isRecord(value) ? value : {};
  return {
    name: asString(record.name, "Template Workflow"),
    description: asOptionalString(record.description),
    goal: asOptionalString(record.goal),
    config: (record.config ?? null) as Prisma.JsonValue | null,
    status: asString(record.status, AgentTeamStatus.ACTIVE),
    isSubWorkflow: asBoolean(record.isSubWorkflow, false),
    parentWorkflowIds: asStringArray(record.parentWorkflowIds),
  };
}

export function snapshotAgentConfig(agent: {
  name: string;
  description: string | null;
  systemPrompt: string;
  personality: Prisma.JsonValue | null;
  welcomeMessage: string | null;
  suggestedQuestions: string[];
  llmModel: string;
  temperature: number;
  modelProvider: ModelProvider;
  status: AgentStatus;
  visibility: AgentVisibility;
  mode: AgentMode;
  triggerType: TriggerType;
  triggerConfig: Prisma.JsonValue | null;
  inputSchema: Prisma.JsonValue | null;
  outputSchema: Prisma.JsonValue | null;
  strictOutputValidation: boolean;
  approvalMode: string;
  approvalConfig: Prisma.JsonValue | null;
  whiteLabel: Prisma.JsonValue | null;
  autoDetectLanguage: boolean;
  memoryEnabled: boolean;
  visitorMemoryEnabled: boolean;
  imageAnalysisEnabled: boolean;
  imageAutoActions: boolean;
  showAiDisclaimer: boolean;
  promptBranches: Prisma.JsonValue | null;
  enableAgenticRag: boolean;
  agenticRagAutoApprove: boolean;
  agenticRagMinConfidence: number;
  a2aEnabled: boolean;
  a2aCapabilities: string[];
  codeExecutionEnabled: boolean;
}): AgentTemplateConfig {
  return {
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    personality: agent.personality,
    welcomeMessage: agent.welcomeMessage,
    suggestedQuestions: agent.suggestedQuestions,
    llmModel: agent.llmModel,
    temperature: agent.temperature,
    modelProvider: agent.modelProvider,
    status: agent.status,
    visibility: agent.visibility,
    mode: agent.mode,
    triggerType: agent.triggerType,
    triggerConfig: agent.triggerConfig,
    inputSchema: agent.inputSchema,
    outputSchema: agent.outputSchema,
    strictOutputValidation: agent.strictOutputValidation,
    approvalMode: agent.approvalMode,
    approvalConfig: agent.approvalConfig,
    whiteLabel: agent.whiteLabel,
    autoDetectLanguage: agent.autoDetectLanguage,
    memoryEnabled: agent.memoryEnabled,
    visitorMemoryEnabled: agent.visitorMemoryEnabled,
    imageAnalysisEnabled: agent.imageAnalysisEnabled,
    imageAutoActions: agent.imageAutoActions,
    showAiDisclaimer: agent.showAiDisclaimer,
    promptBranches: agent.promptBranches,
    enableAgenticRag: agent.enableAgenticRag,
    agenticRagAutoApprove: agent.agenticRagAutoApprove,
    agenticRagMinConfidence: agent.agenticRagMinConfidence,
    a2aEnabled: agent.a2aEnabled,
    a2aCapabilities: agent.a2aCapabilities,
    codeExecutionEnabled: agent.codeExecutionEnabled,
  };
}

export function snapshotWorkflowConfig(team: {
  name: string;
  description: string | null;
  goal: string | null;
  config: Prisma.JsonValue | null;
  status: AgentTeamStatus;
  isSubWorkflow: boolean;
  parentWorkflowIds: string[];
}): WorkflowTemplateConfig {
  return {
    name: team.name,
    description: team.description,
    goal: team.goal,
    config: team.config,
    status: team.status,
    isSubWorkflow: team.isSubWorkflow,
    parentWorkflowIds: team.parentWorkflowIds,
  };
}

function agentCreateInput(args: {
  userId: string;
  orgId: string;
  templateId: string;
  config: AgentTemplateConfig;
}): Prisma.AgentUncheckedCreateInput {
  return {
    userId: args.userId,
    orgId: args.orgId,
    name: args.config.name,
    slug: `${slugify(args.config.name) || "agent"}-${args.orgId.slice(-6)}-${args.templateId.slice(-6)}`,
    description: args.config.description ?? null,
    systemPrompt: args.config.systemPrompt,
    personality: asJson(args.config.personality),
    welcomeMessage: args.config.welcomeMessage ?? null,
    suggestedQuestions: args.config.suggestedQuestions ?? [],
    llmModel: args.config.llmModel ?? "claude-sonnet-4-6",
    temperature: args.config.temperature ?? 0.7,
    modelProvider: enumValue(ModelProvider, args.config.modelProvider, ModelProvider.ANTHROPIC),
    status: enumValue(AgentStatus, args.config.status, AgentStatus.DRAFT),
    visibility: enumValue(AgentVisibility, args.config.visibility, AgentVisibility.PUBLIC),
    mode: enumValue(AgentMode, args.config.mode, AgentMode.CHAT),
    triggerType: enumValue(TriggerType, args.config.triggerType, TriggerType.MANUAL),
    triggerConfig: asJson(args.config.triggerConfig),
    inputSchema: asJson(args.config.inputSchema),
    outputSchema: asJson(args.config.outputSchema),
    strictOutputValidation: args.config.strictOutputValidation ?? false,
    approvalMode: args.config.approvalMode ?? "none",
    approvalConfig: asJson(args.config.approvalConfig),
    whiteLabel: asJson(args.config.whiteLabel),
    autoDetectLanguage: args.config.autoDetectLanguage ?? true,
    memoryEnabled: args.config.memoryEnabled ?? false,
    visitorMemoryEnabled: args.config.visitorMemoryEnabled ?? true,
    imageAnalysisEnabled: args.config.imageAnalysisEnabled ?? false,
    imageAutoActions: args.config.imageAutoActions ?? false,
    showAiDisclaimer: args.config.showAiDisclaimer ?? true,
    promptBranches: asJson(args.config.promptBranches),
    enableAgenticRag: args.config.enableAgenticRag ?? false,
    agenticRagAutoApprove: args.config.agenticRagAutoApprove ?? false,
    agenticRagMinConfidence: args.config.agenticRagMinConfidence ?? 90,
    a2aEnabled: args.config.a2aEnabled ?? false,
    a2aCapabilities: args.config.a2aCapabilities ?? [],
    codeExecutionEnabled: args.config.codeExecutionEnabled ?? false,
    clonedFromId: args.templateId,
    clonedFromName: args.config.name,
  };
}

function agentUpdateInput(config: AgentTemplateConfig): Prisma.AgentUncheckedUpdateInput {
  return {
    name: config.name,
    description: config.description ?? null,
    systemPrompt: config.systemPrompt,
    personality: asJson(config.personality),
    welcomeMessage: config.welcomeMessage ?? null,
    suggestedQuestions: config.suggestedQuestions ?? [],
    llmModel: config.llmModel ?? "claude-sonnet-4-6",
    temperature: config.temperature ?? 0.7,
    modelProvider: enumValue(ModelProvider, config.modelProvider, ModelProvider.ANTHROPIC),
    status: enumValue(AgentStatus, config.status, AgentStatus.DRAFT),
    visibility: enumValue(AgentVisibility, config.visibility, AgentVisibility.PUBLIC),
    mode: enumValue(AgentMode, config.mode, AgentMode.CHAT),
    triggerType: enumValue(TriggerType, config.triggerType, TriggerType.MANUAL),
    triggerConfig: asJson(config.triggerConfig),
    inputSchema: asJson(config.inputSchema),
    outputSchema: asJson(config.outputSchema),
    strictOutputValidation: config.strictOutputValidation ?? false,
    approvalMode: config.approvalMode ?? "none",
    approvalConfig: asJson(config.approvalConfig),
    whiteLabel: asJson(config.whiteLabel),
    autoDetectLanguage: config.autoDetectLanguage ?? true,
    memoryEnabled: config.memoryEnabled ?? false,
    visitorMemoryEnabled: config.visitorMemoryEnabled ?? true,
    imageAnalysisEnabled: config.imageAnalysisEnabled ?? false,
    imageAutoActions: config.imageAutoActions ?? false,
    showAiDisclaimer: config.showAiDisclaimer ?? true,
    promptBranches: asJson(config.promptBranches),
    enableAgenticRag: config.enableAgenticRag ?? false,
    agenticRagAutoApprove: config.agenticRagAutoApprove ?? false,
    agenticRagMinConfidence: config.agenticRagMinConfidence ?? 90,
    a2aEnabled: config.a2aEnabled ?? false,
    a2aCapabilities: config.a2aCapabilities ?? [],
    codeExecutionEnabled: config.codeExecutionEnabled ?? false,
  };
}

function workflowCreateInput(args: {
  userId: string;
  orgId: string;
  config: WorkflowTemplateConfig;
}): Prisma.AgentTeamUncheckedCreateInput {
  return {
    userId: args.userId,
    orgId: args.orgId,
    name: args.config.name,
    description: args.config.description ?? null,
    goal: args.config.goal ?? null,
    config: asJson(args.config.config),
    status: enumValue(AgentTeamStatus, args.config.status, AgentTeamStatus.ACTIVE),
    isSubWorkflow: args.config.isSubWorkflow ?? false,
    parentWorkflowIds: args.config.parentWorkflowIds ?? [],
  };
}

function workflowUpdateInput(config: WorkflowTemplateConfig): Prisma.AgentTeamUncheckedUpdateInput {
  return {
    name: config.name,
    description: config.description ?? null,
    goal: config.goal ?? null,
    config: asJson(config.config),
    status: enumValue(AgentTeamStatus, config.status, AgentTeamStatus.ACTIVE),
    isSubWorkflow: config.isSubWorkflow ?? false,
    parentWorkflowIds: config.parentWorkflowIds ?? [],
  };
}

export async function installSelectedTemplatesForSubOrg(args: {
  agencyOrgId: string;
  subOrgId: string;
  userId: string;
  agentTemplateIds: string[];
  workflowTemplateIds: string[];
}): Promise<TemplateInstallResult> {
  let createdInstances = 0;
  let reusedInstances = 0;
  const agentInstanceIds: string[] = [];
  const workflowInstanceIds: string[] = [];

  const agentTemplates = args.agentTemplateIds.length
    ? await prisma.agentTemplate.findMany({
        where: { agencyOrgId: args.agencyOrgId, id: { in: args.agentTemplateIds }, isPublished: true },
      })
    : [];

  for (const template of agentTemplates) {
    const existing = await prisma.templateInstance.findFirst({
      where: { templateType: "AGENT", templateId: template.id, subOrgId: args.subOrgId },
    });
    if (existing) {
      reusedInstances += 1;
      agentInstanceIds.push(existing.instanceId);
      continue;
    }

    const config = agentConfigFromJson(template.agentConfig);
    const agent = await prisma.agent.create({
      data: agentCreateInput({
        userId: args.userId,
        orgId: args.subOrgId,
        templateId: template.id,
        config,
      }),
      select: { id: true },
    });

    await prisma.templateInstance.create({
      data: {
        templateType: "AGENT",
        templateId: template.id,
        templateVersion: template.version,
        subOrgId: args.subOrgId,
        instanceId: agent.id,
        lastSyncedAt: new Date(),
      },
    });

    createdInstances += 1;
    agentInstanceIds.push(agent.id);
  }

  const workflowTemplates = args.workflowTemplateIds.length
    ? await prisma.workflowTemplate.findMany({
        where: { agencyOrgId: args.agencyOrgId, id: { in: args.workflowTemplateIds }, isPublished: true },
      })
    : [];

  for (const template of workflowTemplates) {
    const existing = await prisma.templateInstance.findFirst({
      where: { templateType: "WORKFLOW", templateId: template.id, subOrgId: args.subOrgId },
    });
    if (existing) {
      reusedInstances += 1;
      workflowInstanceIds.push(existing.instanceId);
      continue;
    }

    const config = workflowConfigFromJson(template.workflowConfig);
    const workflow = await prisma.agentTeam.create({
      data: workflowCreateInput({ userId: args.userId, orgId: args.subOrgId, config }),
      select: { id: true },
    });

    await prisma.templateInstance.create({
      data: {
        templateType: "WORKFLOW",
        templateId: template.id,
        templateVersion: template.version,
        subOrgId: args.subOrgId,
        instanceId: workflow.id,
        lastSyncedAt: new Date(),
      },
    });

    createdInstances += 1;
    workflowInstanceIds.push(workflow.id);
  }

  return { agentInstanceIds, workflowInstanceIds, createdInstances, reusedInstances };
}

export async function markTemplateInstanceCustomized(args: {
  templateType: Exclude<TemplateType, "DEPARTMENT">;
  instanceId: string;
  subOrgId: string;
}): Promise<number> {
  const result = await prisma.templateInstance.updateMany({
    where: {
      templateType: args.templateType,
      instanceId: args.instanceId,
      subOrgId: args.subOrgId,
      isCustomized: false,
    },
    data: { isCustomized: true },
  });
  return result.count;
}

export async function pushAgentTemplateUpdate(args: {
  agencyOrgId: string;
  templateId: string;
}): Promise<TemplatePushResult> {
  const template = await prisma.agentTemplate.findFirst({
    where: { id: args.templateId, agencyOrgId: args.agencyOrgId },
  });
  if (!template) {
    throw new Error("Template not found");
  }

  const instances = await prisma.templateInstance.findMany({
    where: { templateType: "AGENT", templateId: template.id },
  });
  const config = agentConfigFromJson(template.agentConfig);
  let updated = 0;
  let skippedCustomized = 0;
  let missingInstances = 0;

  for (const instance of instances) {
    if (instance.isCustomized) {
      skippedCustomized += 1;
      continue;
    }

    const result = await prisma.agent.updateMany({
      where: { id: instance.instanceId, orgId: instance.subOrgId },
      data: agentUpdateInput(config),
    });

    if (result.count === 0) {
      missingInstances += 1;
      continue;
    }

    await prisma.templateInstance.update({
      where: { id: instance.id },
      data: { templateVersion: template.version, lastSyncedAt: new Date() },
    });
    updated += 1;
  }

  return { templateId: template.id, templateType: "AGENT", updated, skippedCustomized, missingInstances };
}

export async function pushWorkflowTemplateUpdate(args: {
  agencyOrgId: string;
  templateId: string;
}): Promise<TemplatePushResult> {
  const template = await prisma.workflowTemplate.findFirst({
    where: { id: args.templateId, agencyOrgId: args.agencyOrgId },
  });
  if (!template) {
    throw new Error("Template not found");
  }

  const instances = await prisma.templateInstance.findMany({
    where: { templateType: "WORKFLOW", templateId: template.id },
  });
  const config = workflowConfigFromJson(template.workflowConfig);
  let updated = 0;
  let skippedCustomized = 0;
  let missingInstances = 0;

  for (const instance of instances) {
    if (instance.isCustomized) {
      skippedCustomized += 1;
      continue;
    }

    const result = await prisma.agentTeam.updateMany({
      where: { id: instance.instanceId, orgId: instance.subOrgId },
      data: workflowUpdateInput(config),
    });

    if (result.count === 0) {
      missingInstances += 1;
      continue;
    }

    await prisma.templateInstance.update({
      where: { id: instance.id },
      data: { templateVersion: template.version, lastSyncedAt: new Date() },
    });
    updated += 1;
  }

  return { templateId: template.id, templateType: "WORKFLOW", updated, skippedCustomized, missingInstances };
}
