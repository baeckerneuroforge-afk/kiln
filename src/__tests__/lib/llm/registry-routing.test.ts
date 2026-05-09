import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  departmentWorker: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  MODEL_CATALOG,
  findEquivalentModel,
  getDefaultModelForTier,
  getModelById,
  getModelsByProvider,
  getModelsByTier,
  resolveModelAlias,
} from "@/lib/llm/registry";
import { inferTier, resolveModel } from "@/lib/llm/routing/smart-router";
import type { LlmRequest } from "@/lib/llm/types";

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    orgId: "org_a",
    messages: [{ role: "user", content: "Please answer carefully." }],
    ...overrides,
  };
}

describe("llm registry and smart routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.departmentWorker.findUnique.mockResolvedValue(null);
  });

  it("registers all five provider families", () => {
    expect(new Set(MODEL_CATALOG.map((model) => model.provider))).toEqual(
      new Set(["anthropic", "openai", "google", "mistral", "groq"]),
    );
  });

  it("resolves deprecated model aliases to catalog models", () => {
    expect(resolveModelAlias("gpt-5")).toBe("gpt-5.4");
    expect(getModelById("claude-opus-4-20250514")?.modelId).toBe("claude-opus-4-7");
  });

  it("returns null for unknown model ids", () => {
    expect(getModelById("definitely-not-a-real-model")).toBeNull();
  });

  it("returns models by tier and provider", () => {
    expect(getModelsByTier("FAST").every((model) => model.tier === "FAST")).toBe(true);
    expect(getModelsByProvider("mistral").every((model) => model.provider === "mistral")).toBe(true);
  });

  it("finds equivalent fallback models in the same tier", () => {
    const model = getModelById("claude-sonnet-4-6");
    expect(model).not.toBeNull();
    expect(model ? findEquivalentModel(model, "openai")?.tier : null).toBe("BALANCED");
  });

  it("uses an explicit model before all router heuristics", async () => {
    const resolved = await resolveModel(request({ modelId: "gpt-4o-mini", tier: "SMART" }));
    expect(resolved.model.modelId).toBe("gpt-4o-mini");
    expect(resolved.routingReason).toBe("user-requested");
  });

  it("respects a tier override and preferred provider", async () => {
    const resolved = await resolveModel(request({ tier: "FAST", preferredProvider: "google" }));
    expect(resolved.model.provider).toBe("google");
    expect(resolved.model.tier).toBe("FAST");
    expect(resolved.routingReason).toBe("smart-router-FAST");
  });

  it("infers FAST for classification and extraction tasks", () => {
    expect(inferTier(request({ taskType: "classification" }))).toBe("FAST");
    expect(inferTier(request({ messages: [{ role: "user", content: "Extract this as JSON." }] }))).toBe("FAST");
  });

  it("infers BALANCED for department worker reasoning", () => {
    expect(inferTier(request({ taskType: "department_worker" }))).toBe("BALANCED");
  });

  it("infers SMART for deep synthesis work", () => {
    expect(inferTier(request({ taskType: "deep_research_synthesis" }))).toBe("SMART");
  });

  it("lets worker custom model override router defaults", async () => {
    mockPrisma.departmentWorker.findUnique.mockResolvedValue({
      preferredModelTier: "FAST",
      preferredProvider: "google",
      customModelId: "mistral-large-latest",
    });

    const resolved = await resolveModel(request({ workerId: "worker_a", tier: "FAST" }));
    expect(resolved.model.modelId).toBe("mistral-large-latest");
    expect(resolved.routingReason).toBe("worker-custom-model");
  });

  it("uses worker tier and provider settings when no custom model exists", async () => {
    mockPrisma.departmentWorker.findUnique.mockResolvedValue({
      preferredModelTier: "BALANCED",
      preferredProvider: "google",
      customModelId: null,
    });

    const resolved = await resolveModel(request({ workerId: "worker_a" }));
    expect(resolved.model.provider).toBe("google");
    expect(resolved.model.tier).toBe("BALANCED");
    expect(resolved.routingReason).toBe("worker-tier-BALANCED");
  });

  it("falls back to catalog defaults when a preferred provider lacks the tier", () => {
    const model = getDefaultModelForTier("SMART", "groq");
    expect(model.tier).toBe("SMART");
    expect(model.provider).not.toBe("groq");
  });
});
