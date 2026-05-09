import { checkCredits } from "@/lib/credits";
import { checkCache, setCache } from "./routing/caching";
import { callProviderWithFallback, resolveProviderApiKey } from "./routing/fallback-chain";
import { resolveModel } from "./routing/smart-router";
import { trackUsage } from "./observability/usage-tracker";
import { calculateSavings } from "./observability/savings-calculator";
import { validateOutput } from "./validation/schema-validator";
import { validateCitationsIfRequired } from "./validation/citation-checker";
import { buildValidationRetryMessages, LlmValidationError } from "./validation/retry-logic";
import type { LlmRequest, LlmResponse, RawLlmResponse } from "./types";

export class LlmCreditError extends Error {
  readonly statusCode = 402;

  constructor(message: string) {
    super(message);
    this.name = "LlmCreditError";
  }
}

export async function callLlm(request: LlmRequest): Promise<LlmResponse> {
  const startTime = Date.now();
  const resolved = await resolveModel(request);
  const model = resolved.model;

  await ensureCreditAccess(request, model.modelId, model.provider);

  if (request.enableCache !== false) {
    const cached = await checkCache(request, model);
    if (cached) {
      const response = { ...cached, durationMs: Date.now() - startTime };
      await persistUsage(request, response);
      return response;
    }
  }

  const maxAttempts = request.outputSchema || request.requireCitations ? request.maxRetries ?? 3 : 1;
  let attempts = 0;
  let lastValidationError: string | null = null;
  let currentRequest = { ...request, messages: [...request.messages] };

  while (attempts < maxAttempts) {
    attempts += 1;
    const raw = await callProviderWithFallback(model, currentRequest, resolved.routingReason);
    const validation = await validateRawResponse(raw, currentRequest);

    if (!validation.passed) {
      lastValidationError = validation.error;
      currentRequest = {
        ...currentRequest,
        messages: buildValidationRetryMessages(currentRequest.messages, raw.content, validation.error),
      };
      continue;
    }

    const costs = calculateSavings(currentRequest, {
      inputTokens: raw.inputTokens,
      outputTokens: raw.outputTokens,
      cachedInputTokens: raw.cachedInputTokens,
      modelUsed: raw.modelUsed,
      byokActive: raw.byokActive,
    });

    const response: LlmResponse = {
      ...raw,
      parsedOutput: validation.parsedOutput,
      costUsd: costs.actualCostUsd,
      costSavedUsd: costs.costSavedUsd,
      validationAttempts: attempts,
      validationPassed: true,
      cacheHit: false,
      durationMs: Date.now() - startTime,
    };

    await persistUsage(request, response);
    if (request.enableCache !== false) {
      await setCache(request, raw.modelUsed, response);
    }
    return response;
  }

  throw new LlmValidationError(
    `LLM output validation failed after ${maxAttempts} attempts: ${lastValidationError ?? "unknown validation error"}`,
    maxAttempts,
  );
}

async function validateRawResponse(
  raw: RawLlmResponse,
  request: LlmRequest,
): Promise<{ passed: true; parsedOutput?: unknown } | { passed: false; error: string }> {
  let parsedOutput: unknown;
  if (request.outputSchema) {
    const validated = await validateOutput(raw.content, request.outputSchema);
    if (!validated.success) {
      return { passed: false, error: validated.error };
    }
    parsedOutput = validated.data;
  }

  const citationCheck = await validateCitationsIfRequired({
    output: raw.content,
    requireCitations: request.requireCitations,
    knowledgeBaseChunks: request.knowledgeBaseChunks,
  });
  if (!citationCheck.hasCitations || citationCheck.hallucinations.length > 0) {
    return {
      passed: false,
      error: `Citation check failed: ${citationCheck.hallucinations.slice(0, 3).join(" | ") || "missing citations"}`,
    };
  }

  return { passed: true, parsedOutput };
}

async function ensureCreditAccess(
  request: LlmRequest,
  modelId: string,
  provider: LlmResponse["modelUsed"]["provider"],
): Promise<void> {
  if (!request.userId || request.skipCreditCheck) return;
  const apiKey = await resolveProviderApiKey(provider, request);
  const hasByok = Boolean(apiKey?.byokActive);
  const credits = await checkCredits(request.userId, modelId, hasByok, hasByok ? provider : undefined);
  if (!credits.allowed) {
    throw new LlmCreditError(credits.message ?? "No AI credits available. Upgrade or add BYOK.");
  }
}

async function persistUsage(request: LlmRequest, response: LlmResponse): Promise<void> {
  await trackUsage({
    orgId: request.orgId,
    workerId: request.workerId,
    departmentId: request.departmentId,
    modelId: response.modelUsed.modelId,
    provider: response.modelUsed.provider,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    cachedInputTokens: response.cachedInputTokens,
    costUsd: response.costUsd,
    costSavedUsd: response.costSavedUsd,
    routingReason: response.routingReason,
    cacheHit: response.cacheHit,
    byokActive: response.byokActive,
    validationAttempts: response.validationAttempts,
    durationMs: response.durationMs,
  });
}
