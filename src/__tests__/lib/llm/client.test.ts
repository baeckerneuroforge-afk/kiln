import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mockCheckCredits = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  apiKey: { findFirst: vi.fn() },
  departmentWorker: { findUnique: vi.fn() },
  llmUsage: { create: vi.fn() },
}));

vi.mock("@/lib/credits", () => ({
  checkCredits: mockCheckCredits,
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { callLlm, LlmCreditError } from "@/lib/llm/client";
import { clearLlmMemoryCache } from "@/lib/llm/routing/caching";
import type { LlmRequest } from "@/lib/llm/types";

const fetchMock = vi.fn<typeof fetch>();

function baseRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    orgId: "org_a",
    messages: [{ role: "user", content: "Say hello." }],
    skipCreditCheck: true,
    enableCache: false,
    ...overrides,
  };
}

function anthropicResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify(status === 200
      ? {
          id: "msg_123",
          content: [{ type: "text", text: content }],
          usage: { input_tokens: 12, output_tokens: 6 },
        }
      : { error: { message: "temporary outage" } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function openAiResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify(status === 200
      ? {
          id: "chat_123",
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 20, completion_tokens: 9 },
        }
      : { error: { message: "temporary outage" } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function googleResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify(status === 200
      ? {
          responseId: "gemini_123",
          candidates: [{ content: { parts: [{ text: content }] } }],
          usageMetadata: { promptTokenCount: 18, candidatesTokenCount: 7 },
        }
      : { error: { message: "temporary outage" } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function lastJsonBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  const init = call?.[1];
  const body = typeof init?.body === "string" ? init.body : "{}";
  return JSON.parse(body) as Record<string, unknown>;
}

describe("llm client", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    await clearLlmMemoryCache();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform";
    process.env.OPENAI_API_KEY = "sk-openai-platform";
    process.env.GOOGLE_API_KEY = "sk-google-platform";
    process.env.MISTRAL_API_KEY = "sk-mistral-platform";
    process.env.GROQ_API_KEY = "sk-groq-platform";
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    mockPrisma.departmentWorker.findUnique.mockResolvedValue(null);
    mockPrisma.llmUsage.create.mockResolvedValue({});
    mockCheckCredits.mockResolvedValue({ allowed: true, byokActive: false, message: null });
    fetchMock.mockReset();
  });

  it("calls an explicit model", async () => {
    fetchMock.mockResolvedValueOnce(openAiResponse("hello"));
    const result = await callLlm(baseRequest({ modelId: "gpt-4o-mini" }));

    expect(result.content).toBe("hello");
    expect(result.modelUsed.modelId).toBe("gpt-4o-mini");
    expect(result.routingReason).toBe("user-requested");
  });

  it("uses smart routing from a tier hint", async () => {
    fetchMock.mockResolvedValueOnce(openAiResponse("fast"));
    const result = await callLlm(baseRequest({ tier: "FAST" }));

    expect(result.modelUsed.tier).toBe("FAST");
    expect(result.routingReason).toBe("smart-router-FAST");
  });

  it("marks request-scoped BYOK keys and zeroes actual cost", async () => {
    fetchMock.mockResolvedValueOnce(anthropicResponse("byok"));
    const result = await callLlm(baseRequest({
      modelId: "claude-haiku-4-5-20251001",
      userId: "user_a",
      skipCreditCheck: false,
      byokKey: { provider: "anthropic", key: "sk-ant-byok" },
    }));

    expect(mockCheckCredits).toHaveBeenCalledWith("user_a", "claude-haiku-4-5-20251001", true, "anthropic");
    expect(result.byokActive).toBe(true);
    expect(result.costUsd).toBe(0);
  });

  it("checks credits when no BYOK key is active", async () => {
    fetchMock.mockResolvedValueOnce(openAiResponse("pooled"));
    await callLlm(baseRequest({
      modelId: "gpt-4o-mini",
      userId: "user_a",
      skipCreditCheck: false,
    }));

    expect(mockCheckCredits).toHaveBeenCalledWith("user_a", "gpt-4o-mini", false, undefined);
  });

  it("throws a 402 credit error before provider calls", async () => {
    mockCheckCredits.mockResolvedValueOnce({ allowed: false, byokActive: false, message: "Upgrade or BYOK" });

    await expect(callLlm(baseRequest({
      modelId: "gpt-4o-mini",
      userId: "user_a",
      skipCreditCheck: false,
    }))).rejects.toBeInstanceOf(LlmCreditError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores and returns cache hits", async () => {
    fetchMock.mockResolvedValueOnce(openAiResponse("cached answer"));
    const req = baseRequest({ modelId: "gpt-4o-mini", enableCache: true });

    const first = await callLlm(req);
    const second = await callLlm(req);

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.content).toBe("cached answer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates usage rows for cache hits", async () => {
    fetchMock.mockResolvedValueOnce(openAiResponse("cached usage"));
    const req = baseRequest({ modelId: "gpt-4o-mini", enableCache: true });

    await callLlm(req);
    await callLlm(req);

    expect(mockPrisma.llmUsage.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.llmUsage.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ cacheHit: true, costUsd: 0 }),
    });
  });

  it("validates schema output on the first attempt", async () => {
    fetchMock.mockResolvedValueOnce(openAiResponse('{"ok":true}'));
    const result = await callLlm(baseRequest({
      modelId: "gpt-4o-mini",
      outputSchema: z.object({ ok: z.boolean() }),
    }));

    expect(result.parsedOutput).toEqual({ ok: true });
    expect(result.validationAttempts).toBe(1);
  });

  it("retries with validation feedback after schema failures", async () => {
    fetchMock
      .mockResolvedValueOnce(openAiResponse('{"wrong":true}'))
      .mockResolvedValueOnce(openAiResponse('{"ok":true}'));

    const result = await callLlm(baseRequest({
      modelId: "gpt-4o-mini",
      outputSchema: z.object({ ok: z.boolean() }),
      maxRetries: 2,
    }));

    const body = lastJsonBody();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastMessage = messages[messages.length - 1] as Record<string, unknown> | undefined;
    expect(lastMessage?.content).toEqual(expect.stringContaining("Validation failed"));
    expect(result.validationAttempts).toBe(2);
  });

  it("throws after validation fails all retry attempts", async () => {
    fetchMock
      .mockResolvedValueOnce(openAiResponse('{"wrong":true}'))
      .mockResolvedValueOnce(openAiResponse('{"wrong":true}'))
      .mockResolvedValueOnce(openAiResponse('{"wrong":true}'));

    await expect(callLlm(baseRequest({
      modelId: "gpt-4o-mini",
      outputSchema: z.object({ ok: z.boolean() }),
      maxRetries: 3,
    }))).rejects.toThrow("LLM output validation failed after 3 attempts");
  });

  it("falls back to another provider when the primary provider is down", async () => {
    fetchMock
      .mockResolvedValueOnce(anthropicResponse("", 503))
      .mockResolvedValueOnce(openAiResponse("fallback"));

    const result = await callLlm(baseRequest({ modelId: "claude-haiku-4-5-20251001" }));

    expect(result.content).toBe("fallback");
    expect(result.modelUsed.provider).toBe("openai");
    expect(result.routingReason).toBe("fallback-from-anthropic");
  });

  it("throws a clear error when all providers are down", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("generativelanguage.googleapis.com")) return googleResponse("", 503);
      if (url.includes("chat/completions")) return openAiResponse("", 503);
      return anthropicResponse("", 503);
    });

    await expect(callLlm(baseRequest({ modelId: "claude-haiku-4-5-20251001" }))).rejects.toThrow(
      "All LLM providers failed. Retry later or switch provider.",
    );
  });

  it("returns a clear error for invalid BYOK keys", async () => {
    fetchMock.mockResolvedValueOnce(anthropicResponse("", 401));

    await expect(callLlm(baseRequest({
      modelId: "claude-haiku-4-5-20251001",
      byokKey: { provider: "anthropic", key: "bad-key" },
    }))).rejects.toThrow("BYOK key for anthropic is invalid or lacks quota");
  });
});
