import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chunkText, generateEmbeddingsBatched, storeOrgChunks } from "@/lib/rag";
import { getIndustryTemplate } from "@/lib/onboarding/industry-templates";
import type {
  DepartmentTemplate,
  IndustryTemplateDefinition,
  IndustryTemplateMetadata,
  OnboardingIndustry,
} from "@/lib/onboarding/types";

type JsonRecord = Record<string, unknown>;

export interface InstallIndustryPackArgs {
  industry: OnboardingIndustry;
  userId: string;
  orgId: string;
  customerName: string;
  selectedTemplateIds?: string[];
  refreshExisting?: boolean;
}

export interface InstallIndustryPackResult {
  industry: OnboardingIndustry;
  packVersion: string | null;
  departmentIds: string[];
  departmentsCreated: number;
  departmentsReused: number;
  workersCreated: number;
  kbEntriesIndexed: number;
  kbEntriesSkipped: number;
  warnings: string[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function normalizeForSimilarity(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateTextSimilarity(a: string, b: string): number {
  const aWords = new Set(normalizeForSimilarity(a).split(" ").filter(Boolean));
  const bWords = new Set(normalizeForSimilarity(b).split(" ").filter(Boolean));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let intersection = 0;
  for (const word of aWords) {
    if (bWords.has(word)) intersection += 1;
  }
  return intersection / Math.max(aWords.size, bWords.size);
}

function templateFromRow(row: {
  industry: string;
  displayName: string;
  displayNameDe: string | null;
  description: string;
  descriptionDe: string | null;
  departmentTemplates: Prisma.JsonValue;
  knowledgeBaseSeeds: Prisma.JsonValue | null;
  recommendedChannels: Prisma.JsonValue;
  metadata: Prisma.JsonValue | null;
  sortOrder: number;
  iconName: string | null;
}): IndustryTemplateDefinition | null {
  const fallback = getIndustryTemplate(row.industry as OnboardingIndustry);
  if (!fallback) return null;
  return {
    industry: fallback.industry,
    displayName: row.displayName,
    displayNameDe: row.displayNameDe ?? fallback.displayNameDe,
    description: row.description,
    descriptionDe: row.descriptionDe ?? fallback.descriptionDe,
    departmentTemplates: Array.isArray(row.departmentTemplates)
      ? (row.departmentTemplates as unknown as DepartmentTemplate[])
      : fallback.departmentTemplates,
    knowledgeBaseSeeds: Array.isArray(row.knowledgeBaseSeeds)
      ? (row.knowledgeBaseSeeds as { title: string; content: string }[])
      : fallback.knowledgeBaseSeeds,
    recommendedChannels: Array.isArray(row.recommendedChannels)
      ? (row.recommendedChannels as IndustryTemplateDefinition["recommendedChannels"])
      : fallback.recommendedChannels,
    metadata: isRecord(row.metadata) ? (row.metadata as IndustryTemplateMetadata) : fallback.metadata,
    sortOrder: row.sortOrder,
    iconName: row.iconName ?? fallback.iconName,
  };
}

async function loadIndustryTemplate(industry: OnboardingIndustry): Promise<IndustryTemplateDefinition | null> {
  const row = await prisma.industryTemplate.findUnique({ where: { industry } });
  if (row) return templateFromRow(row);
  return getIndustryTemplate(industry);
}

async function createEmbeddedKnowledgeEntry(args: {
  orgId: string;
  title: string;
  content: string;
}): Promise<{ id: string; indexed: boolean; warning?: string }> {
  const chunks = chunkText(args.content);
  const kb = await prisma.knowledgeBase.create({
    data: {
      orgId: args.orgId,
      type: "FAQ",
      sourceName: args.title,
      content: args.content.slice(0, 50000),
      chunkCount: chunks.length,
      embeddingStatus: "PROCESSING",
    },
  });

  try {
    const processed = await generateEmbeddingsBatched(chunks, async (batchChunks, batchEmbeddings) => {
      await storeOrgChunks(kb.id, args.orgId, batchChunks, batchEmbeddings);
    });
    await prisma.knowledgeBase.update({
      where: { id: kb.id },
      data: {
        chunkCount: processed,
        embeddingStatus: "READY",
      },
    });
    return { id: kb.id, indexed: true };
  } catch (err) {
    await prisma.knowledgeBase.update({
      where: { id: kb.id },
      data: { embeddingStatus: "ERROR" },
    });
    return {
      id: kb.id,
      indexed: false,
      warning: `${args.title}: embedding failed (${err instanceof Error ? err.message : "unknown error"})`,
    };
  }
}

async function importSeedKnowledge(args: {
  orgId: string;
  seeds: { title: string; content: string }[];
}): Promise<{ knowledgeBaseIds: string[]; indexed: number; skipped: number; warnings: string[] }> {
  const existing = await prisma.knowledgeBase.findMany({
    where: { orgId: args.orgId, type: "FAQ" },
    select: { id: true, sourceName: true, content: true },
  });
  const knowledgeBaseIds: string[] = [];
  let indexed = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const seed of args.seeds) {
    const duplicate = existing.find((entry) => {
      if (normalizeForSimilarity(entry.sourceName) === normalizeForSimilarity(seed.title)) return true;
      return estimateTextSimilarity(entry.content, seed.content) >= 0.92;
    });

    if (duplicate) {
      knowledgeBaseIds.push(duplicate.id);
      skipped += 1;
      continue;
    }

    const created = await createEmbeddedKnowledgeEntry({
      orgId: args.orgId,
      title: seed.title,
      content: seed.content,
    });
    knowledgeBaseIds.push(created.id);
    existing.push({ id: created.id, sourceName: seed.title, content: seed.content });
    if (created.indexed) indexed += 1;
    if (created.warning) warnings.push(created.warning);
  }

  return { knowledgeBaseIds, indexed, skipped, warnings };
}

function departmentTemplateId(department: { operatingMemory: Prisma.JsonValue; name: string }): string | null {
  if (!isRecord(department.operatingMemory)) return null;
  return asString(department.operatingMemory.industryTemplateId) ?? asString(department.operatingMemory.templateId);
}

function mergeOperatingMemory(args: {
  existing: Prisma.JsonValue | null | undefined;
  template: DepartmentTemplate;
  customerName: string;
  industry: OnboardingIndustry;
  packVersion: string | null;
  knowledgeBaseIds: string[];
  metadata: IndustryTemplateMetadata | undefined;
}): Prisma.InputJsonValue {
  const existing = isRecord(args.existing) ? args.existing : {};
  const templateMemory = args.template.operatingMemory ?? {};
  return ({
    ...templateMemory,
    ...existing,
    industryPack: args.industry,
    industryPackVersion: args.packVersion,
    industryTemplateId: args.template.id,
    customerName: args.customerName,
    industryKnowledgeBaseIds: args.knowledgeBaseIds,
    whatsappTemplates: args.metadata?.whatsappTemplates ?? [],
    voiceScripts: args.metadata?.voiceScripts ?? [],
    recallSchedules: args.metadata?.recallSchedules ?? [],
  } as unknown) as Prisma.InputJsonValue;
}

async function ensureWorker(args: {
  tx: Prisma.TransactionClient;
  userId: string;
  orgId: string;
  customerName: string;
  departmentId: string;
  template: DepartmentTemplate["workers"][number];
  slugSuffix: string;
}): Promise<boolean> {
  const existingWorker = await args.tx.departmentWorker.findFirst({
    where: {
      departmentId: args.departmentId,
      role: args.template.role,
    },
  });
  if (existingWorker) return false;

  const agent = await args.tx.agent.create({
    data: {
      userId: args.userId,
      orgId: args.orgId,
      name: args.template.name,
      slug: `${slugify(args.template.role)}-${slugify(args.customerName)}-${args.slugSuffix}`,
      description: args.template.description,
      systemPrompt: args.template.prompt,
      mode: "TASK",
      status: "DRAFT",
      visibility: "INTERNAL",
      llmModel: "claude-sonnet-4-6",
      modelProvider: "ANTHROPIC",
      suggestedQuestions: [],
      a2aCapabilities: [],
    },
  });

  await args.tx.departmentWorker.create({
    data: {
      departmentId: args.departmentId,
      agentId: agent.id,
      role: args.template.role,
      description: args.template.description,
      priority: args.template.priority,
    },
  });

  return true;
}

async function installDepartments(args: {
  template: IndustryTemplateDefinition;
  selectedDepartments: DepartmentTemplate[];
  userId: string;
  orgId: string;
  customerName: string;
  knowledgeBaseIds: string[];
}): Promise<{ departmentIds: string[]; created: number; reused: number; workersCreated: number }> {
  const existingDepartments = await prisma.department.findMany({
    where: { orgId: args.orgId },
    select: { id: true, name: true, operatingMemory: true },
  });
  let created = 0;
  let reused = 0;
  let workersCreated = 0;
  const departmentIds: string[] = [];
  const slugSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const packVersion = args.template.metadata?.packVersion ?? null;

  await prisma.$transaction(async (tx) => {
    for (const departmentTemplate of args.selectedDepartments) {
      const existing = existingDepartments.find((department) => {
        const id = departmentTemplateId(department);
        return id === departmentTemplate.id || department.name === departmentTemplate.name;
      });

      if (existing) {
        reused += 1;
        departmentIds.push(existing.id);
        await tx.department.update({
          where: { id: existing.id },
          data: {
            operatingMemory: mergeOperatingMemory({
              existing: existing.operatingMemory,
              template: departmentTemplate,
              customerName: args.customerName,
              industry: args.template.industry,
              packVersion,
              knowledgeBaseIds: args.knowledgeBaseIds,
              metadata: args.template.metadata,
            }),
          },
        });
        for (const worker of departmentTemplate.workers) {
          const didCreate = await ensureWorker({
            tx,
            userId: args.userId,
            orgId: args.orgId,
            customerName: args.customerName,
            departmentId: existing.id,
            template: worker,
            slugSuffix,
          });
          if (didCreate) workersCreated += 1;
        }
        continue;
      }

      const department = await tx.department.create({
        data: {
          userId: args.userId,
          orgId: args.orgId,
          name: departmentTemplate.name,
          description: departmentTemplate.description,
          type: "CUSTOM",
          status: "ACTIVE",
          approvalMode: departmentTemplate.approvalMode ?? "APPROVAL_FIRST",
          managerModel: departmentTemplate.managerModel ?? "claude-sonnet-4-6",
          managerSystemPrompt:
            departmentTemplate.managerSystemPrompt ??
            `Du bist der Manager des Departments ${departmentTemplate.name} fuer ${args.customerName}. Koordiniere die Worker, nutze die Knowledge Base und stelle kundengerichtete Antworten zur Freigabe bereit.`,
          webhookEnabled: departmentTemplate.webhookEnabled ?? true,
          scheduleEnabled: departmentTemplate.scheduleEnabled ?? false,
          scheduleCron: departmentTemplate.scheduleCron,
          useKnowledgeBase: departmentTemplate.useKnowledgeBase ?? true,
          knowledgeBaseId: args.knowledgeBaseIds[0] ?? null,
          operatingMemory: mergeOperatingMemory({
            existing: null,
            template: departmentTemplate,
            customerName: args.customerName,
            industry: args.template.industry,
            packVersion,
            knowledgeBaseIds: args.knowledgeBaseIds,
            metadata: args.template.metadata,
          }),
        },
      });
      created += 1;
      departmentIds.push(department.id);

      for (const worker of departmentTemplate.workers) {
        const didCreate = await ensureWorker({
          tx,
          userId: args.userId,
          orgId: args.orgId,
          customerName: args.customerName,
          departmentId: department.id,
          template: worker,
          slugSuffix,
        });
        if (didCreate) workersCreated += 1;
      }
    }
  });

  return { departmentIds, created, reused, workersCreated };
}

export async function installIndustryPack(args: InstallIndustryPackArgs): Promise<InstallIndustryPackResult> {
  const template = await loadIndustryTemplate(args.industry);
  if (!template) {
    return {
      industry: args.industry,
      packVersion: null,
      departmentIds: [],
      departmentsCreated: 0,
      departmentsReused: 0,
      workersCreated: 0,
      kbEntriesIndexed: 0,
      kbEntriesSkipped: 0,
      warnings: [`No industry template found for ${args.industry}.`],
    };
  }

  const selected = new Set(args.selectedTemplateIds ?? []);
  const selectedDepartments =
    selected.size > 0
      ? template.departmentTemplates.filter((department) => selected.has(department.id))
      : template.departmentTemplates.filter((department) => department.defaultSelected);

  const kb = await importSeedKnowledge({
    orgId: args.orgId,
    seeds: template.knowledgeBaseSeeds,
  });
  const departments = await installDepartments({
    template,
    selectedDepartments,
    userId: args.userId,
    orgId: args.orgId,
    customerName: args.customerName,
    knowledgeBaseIds: kb.knowledgeBaseIds,
  });

  return {
    industry: template.industry,
    packVersion: template.metadata?.packVersion ?? null,
    departmentIds: departments.departmentIds,
    departmentsCreated: departments.created,
    departmentsReused: departments.reused,
    workersCreated: departments.workersCreated,
    kbEntriesIndexed: kb.indexed,
    kbEntriesSkipped: kb.skipped,
    warnings: kb.warnings,
  };
}
