import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { CacheEntry, LlmModel, LlmRequest, LlmResponse } from "../types";

let redisClient: Redis | null | undefined;
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

export function computeCacheKey(request: LlmRequest, model: LlmModel): string {
  const hash = createHash("sha256");
  hash.update(request.orgId);
  hash.update(model.modelId);
  hash.update(JSON.stringify(request.messages));
  hash.update(request.systemPrompt ?? "");
  hash.update(String(request.temperature ?? 0.7));
  hash.update(String(request.maxTokens ?? ""));
  hash.update(request.outputSchema ? "schema:v1" : "schema:none");
  return hash.digest("hex");
}

export async function checkCache(request: LlmRequest, model: LlmModel): Promise<LlmResponse | null> {
  const key = cacheStorageKey(request, model);
  try {
    const cached = await getCacheValue(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as unknown;
    if (!isCacheEntry(parsed)) {
      await deleteCacheValue(key);
      return null;
    }
    const naiveCost = parsed.costUsd + Math.max(0, parsed.costSavedUsd);
    return {
      ...parsed,
      cacheHit: true,
      costUsd: 0,
      costSavedUsd: naiveCost,
      durationMs: 0,
      byokActive: parsed.byokActive,
    };
  } catch {
    await deleteCacheValue(key).catch(() => {});
    return null;
  }
}

export async function setCache(
  request: LlmRequest,
  model: LlmModel,
  response: LlmResponse,
): Promise<void> {
  const entry: CacheEntry = {
    content: response.content,
    parsedOutput: response.parsedOutput,
    modelUsed: response.modelUsed,
    routingReason: response.routingReason,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    cachedInputTokens: response.cachedInputTokens,
    costUsd: response.costUsd,
    costSavedUsd: response.costSavedUsd,
    validationAttempts: response.validationAttempts,
    validationPassed: response.validationPassed,
    durationMs: response.durationMs,
    byokActive: response.byokActive,
  };
  const ttl = request.cacheTtlSeconds ?? 3600;
  try {
    await setCacheValue(cacheStorageKey(request, model), JSON.stringify(entry), ttl);
  } catch {
    // Cache is an optimization; never block LLM completion.
  }
}

export async function clearLlmMemoryCache(): Promise<void> {
  memoryCache.clear();
}

function cacheStorageKey(request: LlmRequest, model: LlmModel): string {
  return `llm-cache:${computeCacheKey(request, model)}`;
}

async function getCacheValue(key: string): Promise<string | null> {
  const redis = getRedisClient();
  if (redis) {
    const value = await redis.get<string>(key);
    return typeof value === "string" ? value : value ? JSON.stringify(value) : null;
  }

  const memory = memoryCache.get(key);
  if (!memory) return null;
  if (memory.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return memory.value;
}

async function setCacheValue(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.set(key, value, { ex: ttlSeconds });
    return;
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function deleteCacheValue(key: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.del(key);
    return;
  }
  memoryCache.delete(key);
}

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.content === "string"
    && typeof record.routingReason === "string"
    && typeof record.inputTokens === "number"
    && typeof record.outputTokens === "number"
    && typeof record.costUsd === "number"
    && typeof record.costSavedUsd === "number"
    && typeof record.validationAttempts === "number"
    && typeof record.validationPassed === "boolean"
    && typeof record.byokActive === "boolean"
    && record.modelUsed !== null
    && typeof record.modelUsed === "object"
  );
}
