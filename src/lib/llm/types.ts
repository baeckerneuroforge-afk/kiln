import type { z } from "zod";

export type LlmProvider = "anthropic" | "openai" | "google" | "mistral" | "groq";

export type ModelTier = "FAST" | "BALANCED" | "SMART";

export type LlmMessageRole = "user" | "assistant" | "system";

export type LlmTaskType =
  | "classification"
  | "routing"
  | "data_extraction"
  | "structured_output"
  | "summarization"
  | "department_worker"
  | "manager_loop"
  | "deep_research_synthesis"
  | "code_generation"
  | "reasoning"
  | "conversation"
  | "general";

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export interface LlmModel {
  provider: LlmProvider;
  modelId: string;
  tier: ModelTier;
  inputTokenPriceUsdPer1M: number;
  outputTokenPriceUsdPer1M: number;
  contextWindowTokens: number;
  supportsCaching: boolean;
  supportsToolUse: boolean;
  supportsJsonMode: boolean;
}

export interface LlmByokKey {
  provider: LlmProvider;
  key: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  modelId?: string;
  tier?: ModelTier;
  preferredProvider?: LlmProvider;
  taskType?: LlmTaskType;
  outputSchema?: z.ZodSchema<unknown>;
  maxRetries?: number;
  requireCitations?: boolean;
  knowledgeBaseChunks?: string[];
  orgId: string;
  userId?: string;
  workerId?: string;
  departmentId?: string;
  byokKey?: LlmByokKey;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  enableCache?: boolean;
  cacheTtlSeconds?: number;
  timeoutMs?: number;
  skipCreditCheck?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RawLlmResponse {
  content: string;
  modelUsed: LlmModel;
  routingReason: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  byokActive: boolean;
  providerResponseId?: string;
}

export interface LlmResponse extends RawLlmResponse {
  parsedOutput?: unknown;
  costUsd: number;
  costSavedUsd: number;
  validationAttempts: number;
  validationPassed: boolean;
  cacheHit: boolean;
  durationMs: number;
}

export interface CacheEntry {
  content: string;
  parsedOutput?: unknown;
  modelUsed: LlmModel;
  routingReason: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
  costSavedUsd: number;
  validationAttempts: number;
  validationPassed: boolean;
  durationMs: number;
  byokActive: boolean;
}

export interface ProviderCallResult {
  response: RawLlmResponse;
  fallbackUsed: boolean;
  fallbackFrom?: LlmProvider;
}

export interface ProviderApiKey {
  key: string;
  byokActive: boolean;
  source: "request-byok" | "stored-byok" | "platform";
}

export interface LlmUsageInput {
  orgId: string;
  workerId?: string;
  departmentId?: string;
  modelId: string;
  provider: LlmProvider;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
  costSavedUsd: number;
  routingReason?: string;
  cacheHit: boolean;
  byokActive: boolean;
  validationAttempts: number;
  durationMs: number;
}
