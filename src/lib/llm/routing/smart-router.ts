import { prisma } from "@/lib/prisma";
import { getDefaultModelForTier, getModelById, getModelsByTier } from "../registry";
import type { LlmModel, LlmProvider, LlmRequest, LlmTaskType, ModelTier } from "../types";

export interface ResolvedModel {
  model: LlmModel;
  routingReason: string;
}

const FAST_TASKS = new Set<LlmTaskType>([
  "classification",
  "routing",
  "data_extraction",
  "structured_output",
  "summarization",
  "manager_loop",
]);

const SMART_TASKS = new Set<LlmTaskType>([
  "deep_research_synthesis",
  "code_generation",
]);

export async function resolveModel(request: LlmRequest): Promise<ResolvedModel> {
  if (request.modelId) {
    const explicit = getModelById(request.modelId);
    if (!explicit) throw new Error(`Unknown LLM model: ${request.modelId}`);
    return { model: explicit, routingReason: "user-requested" };
  }

  const workerConfig = await loadWorkerModelConfig(request.workerId);
  if (workerConfig?.customModelId) {
    const workerModel = getModelById(workerConfig.customModelId);
    if (workerModel) {
      return { model: workerModel, routingReason: "worker-custom-model" };
    }
  }

  const preferredProvider = request.preferredProvider
    ?? workerConfig?.preferredProvider
    ?? request.byokKey?.provider
    ?? await loadOrgPreferredProvider(request.orgId);

  if (workerConfig?.preferredModelTier) {
    const model = getDefaultModelForTier(workerConfig.preferredModelTier, preferredProvider);
    return { model, routingReason: `worker-tier-${workerConfig.preferredModelTier}` };
  }

  if (request.tier) {
    const model = getDefaultModelForTier(request.tier, preferredProvider);
    return { model, routingReason: `smart-router-${request.tier}` };
  }

  const tier = inferTier(request);
  const model = pickBestModelForTier(tier, preferredProvider);
  return { model, routingReason: `smart-router-${tier}` };
}

export function inferTier(request: LlmRequest): ModelTier {
  if (request.taskType && FAST_TASKS.has(request.taskType)) return "FAST";
  if (request.taskType && SMART_TASKS.has(request.taskType)) return "SMART";
  if (request.taskType === "department_worker" || request.taskType === "reasoning") return "BALANCED";

  const text = [...request.messages.map((message) => message.content), request.systemPrompt ?? ""].join("\n").toLowerCase();
  if (/\b(classify|categorize|extract|json|summary|summarize|route)\b/.test(text)) return "FAST";
  if (/\b(deep research|comprehensive|architecture|strategy|code|reason through)\b/.test(text)) return "SMART";
  return "BALANCED";
}

export function pickBestModelForTier(tier: ModelTier, preferredProvider?: LlmProvider): LlmModel {
  if (preferredProvider) {
    const providerModel = getModelsByTier(tier).find((model) => model.provider === preferredProvider);
    if (providerModel) return providerModel;
  }
  return getDefaultModelForTier(tier);
}

function isModelTier(value: unknown): value is ModelTier {
  return value === "FAST" || value === "BALANCED" || value === "SMART";
}

function isProvider(value: unknown): value is LlmProvider {
  return value === "anthropic" || value === "openai" || value === "google" || value === "mistral" || value === "groq";
}

async function loadWorkerModelConfig(workerId?: string): Promise<{
  preferredModelTier?: ModelTier;
  preferredProvider?: LlmProvider;
  customModelId?: string;
} | null> {
  if (!workerId) return null;
  try {
    const worker = await prisma.departmentWorker.findUnique({
      where: { id: workerId },
      select: {
        preferredModelTier: true,
        preferredProvider: true,
        customModelId: true,
      },
    });
    if (!worker) return null;
    return {
      preferredModelTier: isModelTier(worker.preferredModelTier) ? worker.preferredModelTier : undefined,
      preferredProvider: isProvider(worker.preferredProvider) ? worker.preferredProvider : undefined,
      customModelId: worker.customModelId ?? undefined,
    };
  } catch {
    return null;
  }
}

async function loadOrgPreferredProvider(orgId: string): Promise<LlmProvider | undefined> {
  void orgId;
  return undefined;
}
