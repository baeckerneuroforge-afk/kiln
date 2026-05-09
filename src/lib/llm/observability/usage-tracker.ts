import { prisma } from "@/lib/prisma";
import type { LlmUsageInput } from "../types";

export async function trackUsage(usage: LlmUsageInput): Promise<void> {
  try {
    await prisma.llmUsage.create({
      data: {
        orgId: usage.orgId,
        workerId: usage.workerId ?? null,
        departmentId: usage.departmentId ?? null,
        modelId: usage.modelId,
        provider: usage.provider,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        costUsd: usage.costUsd,
        costSavedUsd: usage.costSavedUsd,
        routingReason: usage.routingReason ?? null,
        cacheHit: usage.cacheHit,
        byokActive: usage.byokActive,
        validationAttempts: usage.validationAttempts,
        durationMs: usage.durationMs,
      },
    });
  } catch (error) {
    console.warn("[llm-usage] failed to persist usage", error instanceof Error ? error.message : error);
  }
}

export interface LlmUsageSummary {
  totalCostUsd: number;
  totalSavedUsd: number;
  totalNaiveCostUsd: number;
  totalCalls: number;
  cacheHitRate: number;
  byokCalls: number;
}

export async function getLlmUsageSummary(args: {
  orgId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<LlmUsageSummary> {
  try {
    const rows = await prisma.llmUsage.findMany({
      where: {
        orgId: args.orgId,
        createdAt: { gte: args.periodStart, lte: args.periodEnd },
      },
      select: {
        costUsd: true,
        costSavedUsd: true,
        cacheHit: true,
        byokActive: true,
      },
    });
    const totalCostUsd = rows.reduce((sum, row) => sum + Number(row.costUsd), 0);
    const totalSavedUsd = rows.reduce((sum, row) => sum + Number(row.costSavedUsd), 0);
    const totalCalls = rows.length;
    return {
      totalCostUsd,
      totalSavedUsd,
      totalNaiveCostUsd: totalCostUsd + totalSavedUsd,
      totalCalls,
      cacheHitRate: totalCalls === 0 ? 0 : Math.round((rows.filter((row) => row.cacheHit).length / totalCalls) * 100),
      byokCalls: rows.filter((row) => row.byokActive).length,
    };
  } catch {
    return {
      totalCostUsd: 0,
      totalSavedUsd: 0,
      totalNaiveCostUsd: 0,
      totalCalls: 0,
      cacheHitRate: 0,
      byokCalls: 0,
    };
  }
}
