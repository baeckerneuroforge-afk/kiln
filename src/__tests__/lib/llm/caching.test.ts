import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { getModelById } from "@/lib/llm/registry";
import { checkCache, clearLlmMemoryCache, computeCacheKey, setCache } from "@/lib/llm/routing/caching";
import type { LlmModel, LlmRequest, LlmResponse } from "@/lib/llm/types";

const model = getModelById("claude-haiku-4-5-20251001") as LlmModel;

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    orgId: "org_a",
    messages: [{ role: "user", content: "Summarize this." }],
    temperature: 0.2,
    ...overrides,
  };
}

function response(overrides: Partial<LlmResponse> = {}): LlmResponse {
  return {
    content: "Cached answer",
    modelUsed: model,
    routingReason: "smart-router-FAST",
    inputTokens: 10,
    outputTokens: 5,
    cachedInputTokens: 0,
    byokActive: false,
    costUsd: 0.000028,
    costSavedUsd: 0.0002,
    validationAttempts: 1,
    validationPassed: true,
    cacheHit: false,
    durationMs: 20,
    ...overrides,
  };
}

describe("llm response caching", () => {
  beforeEach(async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    await clearLlmMemoryCache();
  });

  it("returns cached responses for identical requests", async () => {
    const req = request();
    await setCache(req, model, response());

    const cached = await checkCache(req, model);
    expect(cached?.cacheHit).toBe(true);
    expect(cached?.content).toBe("Cached answer");
  });

  it("does not charge actual cost on cache hits", async () => {
    const req = request();
    await setCache(req, model, response({ costUsd: 0.5, costSavedUsd: 1.25 }));

    const cached = await checkCache(req, model);
    expect(cached?.costUsd).toBe(0);
    expect(cached?.costSavedUsd).toBe(1.75);
  });

  it("uses different cache keys for different temperatures", () => {
    expect(computeCacheKey(request({ temperature: 0.2 }), model)).not.toBe(
      computeCacheKey(request({ temperature: 0.7 }), model),
    );
  });

  it("uses different cache keys for different orgs", () => {
    expect(computeCacheKey(request({ orgId: "org_a" }), model)).not.toBe(
      computeCacheKey(request({ orgId: "org_b" }), model),
    );
  });

  it("uses different cache keys for different model ids", () => {
    const openaiModel = getModelById("gpt-4o-mini") as LlmModel;
    expect(computeCacheKey(request(), model)).not.toBe(computeCacheKey(request(), openaiModel));
  });

  it("uses different cache keys when validation schema is enabled", () => {
    const schema = z.object({ answer: z.string() });
    expect(computeCacheKey(request(), model)).not.toBe(
      computeCacheKey(request({ outputSchema: schema }), model),
    );
  });

  it("respects expired TTL values", async () => {
    const req = request({ cacheTtlSeconds: -1 });
    await setCache(req, model, response());
    await expect(checkCache(req, model)).resolves.toBeNull();
  });

  it("isolates cache entries by tenant", async () => {
    await setCache(request({ orgId: "org_a" }), model, response({ content: "Org A" }));
    await setCache(request({ orgId: "org_b" }), model, response({ content: "Org B" }));

    await expect(checkCache(request({ orgId: "org_a" }), model)).resolves.toMatchObject({ content: "Org A" });
    await expect(checkCache(request({ orgId: "org_b" }), model)).resolves.toMatchObject({ content: "Org B" });
  });
});
