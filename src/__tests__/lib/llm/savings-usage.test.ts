import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  llmUsage: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { getModelById } from "@/lib/llm/registry";
import {
  calculateActualCost,
  calculateNaiveCost,
  calculateSavings,
} from "@/lib/llm/observability/savings-calculator";
import { getLlmUsageSummary, trackUsage } from "@/lib/llm/observability/usage-tracker";
import type { LlmModel, LlmRequest } from "@/lib/llm/types";

const fastModel = getModelById("gpt-4o-mini") as LlmModel;

function request(): LlmRequest {
  return {
    orgId: "org_a",
    messages: [{ role: "user", content: "Classify this." }],
  };
}

describe("llm savings and usage tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.llmUsage.create.mockResolvedValue({});
    mockPrisma.llmUsage.findMany.mockResolvedValue([]);
  });

  it("calculates naive cost with SMART-tier pricing", () => {
    const cost = calculateNaiveCost(request(), {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cachedInputTokens: 0,
      modelUsed: fastModel,
    });
    expect(cost).toBe(0.65);
  });

  it("calculates actual cost from the routed model", () => {
    expect(calculateActualCost(request(), {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cachedInputTokens: 0,
      modelUsed: fastModel,
    })).toBe(0.21);
  });

  it("sets actual customer cost to zero for BYOK calls", () => {
    expect(calculateActualCost(request(), {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cachedInputTokens: 0,
      modelUsed: fastModel,
      byokActive: true,
    })).toBe(0);
  });

  it("accounts for cached input token savings", () => {
    const actual = calculateActualCost(request(), {
      inputTokens: 100_000,
      outputTokens: 10_000,
      cachedInputTokens: 1_000_000,
      modelUsed: fastModel,
    });
    expect(actual).toBeLessThan(0.021);
  });

  it("calculates positive savings versus naive execution", () => {
    const result = calculateSavings(request(), {
      inputTokens: 20_000,
      outputTokens: 5_000,
      cachedInputTokens: 0,
      modelUsed: fastModel,
    });
    expect(result.naiveCostUsd).toBeGreaterThan(result.actualCostUsd);
    expect(result.costSavedUsd).toBeGreaterThan(0);
  });

  it("creates one usage row per call without blocking callers", async () => {
    await trackUsage({
      orgId: "org_a",
      workerId: "worker_a",
      departmentId: "dept_a",
      modelId: fastModel.modelId,
      provider: fastModel.provider,
      inputTokens: 10,
      outputTokens: 3,
      cachedInputTokens: 0,
      costUsd: 0.00001,
      costSavedUsd: 0.0001,
      routingReason: "smart-router-FAST",
      cacheHit: false,
      byokActive: false,
      validationAttempts: 1,
      durationMs: 42,
    });

    expect(mockPrisma.llmUsage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org_a",
        workerId: "worker_a",
        departmentId: "dept_a",
        modelId: fastModel.modelId,
        cacheHit: false,
      }),
    });
  });

  it("swallows usage insert failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockPrisma.llmUsage.create.mockRejectedValueOnce(new Error("db down"));

    await expect(trackUsage({
      orgId: "org_a",
      modelId: fastModel.modelId,
      provider: fastModel.provider,
      inputTokens: 10,
      outputTokens: 3,
      cachedInputTokens: 0,
      costUsd: 0,
      costSavedUsd: 0,
      cacheHit: true,
      byokActive: true,
      validationAttempts: 1,
      durationMs: 1,
    })).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
  });

  it("summarizes usage rows for dashboards", async () => {
    mockPrisma.llmUsage.findMany.mockResolvedValueOnce([
      { costUsd: 1, costSavedUsd: 2, cacheHit: true, byokActive: false },
      { costUsd: "3.5", costSavedUsd: "0.5", cacheHit: false, byokActive: true },
    ]);

    const summary = await getLlmUsageSummary({
      orgId: "org_a",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-05-01"),
    });

    expect(summary).toMatchObject({
      totalCostUsd: 4.5,
      totalSavedUsd: 2.5,
      totalNaiveCostUsd: 7,
      totalCalls: 2,
      cacheHitRate: 50,
      byokCalls: 1,
    });
  });
});
