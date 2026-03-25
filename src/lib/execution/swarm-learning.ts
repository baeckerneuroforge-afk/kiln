/**
 * Swarm Learning Pipeline
 * Lernt aus jeder Swarm-Ausführung: welche Dekomposition, Prompts und Tools
 * die besten Ergebnisse liefern. Verbessert sich automatisch über Zeit.
 */

import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import type { GoalAnalysis, DecompositionResult } from "./task-decomposer";
import type { SubAgentResult } from "./sub-agent-executor";
import type { IntelligentMergeResult, IntelligentMergeStrategy } from "./intelligent-merge";

/* ── Types ── */

export interface SwarmExecutionRecord {
  userId: string;
  goal: string;
  goalAnalysis: GoalAnalysis;
  decomposition: DecompositionResult;
  agentResults: SubAgentResult[];
  mergeResult: IntelligentMergeResult;
  mergeStrategy: IntelligentMergeStrategy;
  executionTimeMs: number;
  creditsUsed: number;
}

export interface OptimalConfig {
  suggestedMaxTasks: number;
  suggestedTools: string[];
  suggestedSpecializations: string[];
  avgQuality: number;
  sampleSize: number;
  confidence: number; // 0-1, basierend auf Stichprobengröße
}

export interface PromptEffectiveness {
  promptHash: string;
  avgQuality: number;
  avgExecutionTimeMs: number;
  avgCredits: number;
  sampleSize: number;
}

export interface ToolCorrelation {
  tool: string;
  avgQualityWith: number;
  avgQualityWithout: number;
  usageCount: number;
  recommendation: "always" | "situational" | "avoid";
}

/* ── Helpers ── */

function hashGoal(goal: string): string {
  const normalized = goal
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function hashPrompts(specializations: string[]): string {
  const joined = specializations.sort().join("|");
  return createHash("sha256").update(joined).digest("hex").slice(0, 12);
}

function computeQualityScore(
  mergeResult: IntelligentMergeResult,
  agentResults: SubAgentResult[],
): number {
  const mergeQuality = mergeResult.qualityScore || 0;
  const agentAvg =
    agentResults.length > 0
      ? agentResults.reduce((sum, r) => {
          const hasOutput = r.result && r.result.length > 50 ? 0.3 : 0;
          const hasSources = r.sources && r.sources.length > 0 ? 0.3 : 0;
          const completed = r.stoppedReason === "completed" ? 0.4 : 0.1;
          return sum + hasOutput + hasSources + completed;
        }, 0) / agentResults.length
      : 0;
  // Gewichtung: 60% Merge-Qualität, 40% Agent-Durchschnitt
  return Math.min(1, mergeQuality * 0.6 + agentAvg * 0.4);
}

/* ── Hauptfunktionen ── */

/**
 * Speichert Lerndaten aus einer Swarm-Ausführung.
 * Wird am Ende jeder Swarm-Execution aufgerufen (fire-and-forget).
 */
export async function learnFromSwarmExecution(
  record: SwarmExecutionRecord,
): Promise<string | null> {
  try {
    const { goal, goalAnalysis, decomposition, agentResults, mergeResult, mergeStrategy } = record;

    const specializations = agentResults.map((r) => r.specialization || "researcher");
    const toolsUsed = [...new Set(decomposition.tasks.flatMap((t) => t.tools || []))];
    const qualityScore = computeQualityScore(mergeResult, agentResults);

    const entry = await prisma.swarmIntelligence.create({
      data: {
        userId: record.userId,
        goalHash: hashGoal(goal),
        goalSnippet: goal.slice(0, 200),
        taskType: goalAnalysis.taskType,
        scope: goalAnalysis.scope,
        complexity: goalAnalysis.estimatedComplexity,
        agentCount: agentResults.length,
        decompositionConfig: {
          maxTasks: decomposition.tasks.length,
          phases: decomposition.executionPlan.phases.length,
          specializations,
          tools: toolsUsed,
          mergeStrategy: decomposition.executionPlan.mergeStrategy,
        },
        promptVersionHash: hashPrompts(specializations),
        toolsUsed,
        mergeStrategy,
        qualityScore,
        executionTimeMs: record.executionTimeMs,
        creditsUsed: record.creditsUsed,
        agentResults: agentResults.map((r) => ({
          id: r.id,
          specialization: r.specialization,
          toolCalls: r.toolCallsCount,
          stoppedReason: r.stoppedReason,
          cost: r.cost,
          sourcesCount: r.sources?.length || 0,
        })),
        conflictCount: mergeResult.conflicts?.length || 0,
        sourcesFound: agentResults.reduce((s, r) => s + (r.sources?.length || 0), 0),
        errorCount: agentResults.filter((r) => r.stoppedReason === "error").length,
      },
    });

    return entry.id;
  } catch (err) {
    console.error("[swarm-learning] Fehler beim Speichern:", err);
    return null;
  }
}

/**
 * Speichert User-Feedback (Daumen hoch/runter) für eine Swarm-Ausführung.
 */
export async function trackUserSignal(
  intelligenceId: string,
  signal: 1 | -1,
): Promise<void> {
  try {
    await prisma.swarmIntelligence.update({
      where: { id: intelligenceId },
      data: { userSignal: signal },
    });
  } catch (err) {
    console.error("[swarm-learning] Fehler beim Signal-Update:", err);
  }
}

/**
 * Liefert optimale Konfiguration basierend auf historischen Daten
 * für einen bestimmten Task-Typ.
 */
export async function getOptimalConfig(
  taskType: string,
  scope: string,
  complexity: string,
): Promise<OptimalConfig | null> {
  try {
    const records = await prisma.swarmIntelligence.findMany({
      where: {
        taskType,
        scope,
        complexity,
        qualityScore: { gte: 0.5 }, // Nur erfolgreiche Ausführungen
      },
      orderBy: { qualityScore: "desc" },
      take: 50,
      select: {
        agentCount: true,
        toolsUsed: true,
        decompositionConfig: true,
        qualityScore: true,
        userSignal: true,
      },
    });

    if (records.length < 3) return null; // Zu wenige Datenpunkte

    // User-Signal gewichteter Durchschnitt
    const weighted = records.map((r) => ({
      ...r,
      weight: r.userSignal === 1 ? 1.5 : r.userSignal === -1 ? 0.3 : 1.0,
    }));

    const totalWeight = weighted.reduce((s, r) => s + r.weight, 0);
    const avgQuality =
      weighted.reduce((s, r) => s + r.qualityScore * r.weight, 0) / totalWeight;

    // Meistgenutzte Tools aus Top-Ergebnissen
    const toolCounts: Record<string, number> = {};
    for (const r of weighted.slice(0, 20)) {
      for (const tool of r.toolsUsed) {
        toolCounts[tool] = (toolCounts[tool] || 0) + r.weight;
      }
    }
    const suggestedTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool]) => tool);

    // Durchschnittliche Agent-Anzahl der Top-Ergebnisse
    const topRecords = weighted.filter((r) => r.qualityScore >= 0.7);
    const suggestedMaxTasks =
      topRecords.length > 0
        ? Math.round(topRecords.reduce((s, r) => s + r.agentCount, 0) / topRecords.length)
        : Math.round(weighted.reduce((s, r) => s + r.agentCount, 0) / weighted.length);

    // Specializations aus decompositionConfig extrahieren
    const specCounts: Record<string, number> = {};
    for (const r of weighted.slice(0, 20)) {
      const config = r.decompositionConfig as { specializations?: string[] } | null;
      if (config?.specializations) {
        for (const spec of config.specializations) {
          specCounts[spec] = (specCounts[spec] || 0) + r.weight;
        }
      }
    }
    const suggestedSpecializations = Object.entries(specCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([spec]) => spec);

    // Confidence basierend auf Stichprobengröße
    const confidence = Math.min(1, records.length / 30);

    return {
      suggestedMaxTasks,
      suggestedTools,
      suggestedSpecializations,
      avgQuality,
      sampleSize: records.length,
      confidence,
    };
  } catch (err) {
    console.error("[swarm-learning] Fehler bei getOptimalConfig:", err);
    return null;
  }
}

/**
 * Vergleicht Prompt-Versionen nach Effektivität.
 */
export async function getPromptEffectiveness(
  taskType: string,
): Promise<PromptEffectiveness[]> {
  try {
    const records = await prisma.swarmIntelligence.groupBy({
      by: ["promptVersionHash"],
      where: { taskType },
      _avg: {
        qualityScore: true,
        executionTimeMs: true,
        creditsUsed: true,
      },
      _count: { id: true },
      orderBy: { _avg: { qualityScore: "desc" } },
      take: 10,
    });

    return records.map((r) => ({
      promptHash: r.promptVersionHash,
      avgQuality: r._avg.qualityScore || 0,
      avgExecutionTimeMs: r._avg.executionTimeMs || 0,
      avgCredits: r._avg.creditsUsed || 0,
      sampleSize: r._count.id,
    }));
  } catch (err) {
    console.error("[swarm-learning] Fehler bei getPromptEffectiveness:", err);
    return [];
  }
}

/**
 * Analysiert Tool-Korrelationen mit Ergebnis-Qualität für einen Task-Typ.
 */
export async function getToolCorrelations(
  taskType: string,
): Promise<ToolCorrelation[]> {
  try {
    const allRecords = await prisma.swarmIntelligence.findMany({
      where: { taskType },
      select: {
        toolsUsed: true,
        qualityScore: true,
      },
      take: 200,
      orderBy: { createdAt: "desc" },
    });

    if (allRecords.length < 5) return [];

    const allTools = [...new Set(allRecords.flatMap((r) => r.toolsUsed))];
    const correlations: ToolCorrelation[] = [];

    for (const tool of allTools) {
      const withTool = allRecords.filter((r) => r.toolsUsed.includes(tool));
      const withoutTool = allRecords.filter((r) => !r.toolsUsed.includes(tool));

      const avgWith =
        withTool.length > 0
          ? withTool.reduce((s, r) => s + r.qualityScore, 0) / withTool.length
          : 0;
      const avgWithout =
        withoutTool.length > 0
          ? withoutTool.reduce((s, r) => s + r.qualityScore, 0) / withoutTool.length
          : 0;

      let recommendation: "always" | "situational" | "avoid";
      if (avgWith > avgWithout + 0.15 && withTool.length >= 3) {
        recommendation = "always";
      } else if (avgWith < avgWithout - 0.15 && withoutTool.length >= 3) {
        recommendation = "avoid";
      } else {
        recommendation = "situational";
      }

      correlations.push({
        tool,
        avgQualityWith: Math.round(avgWith * 100) / 100,
        avgQualityWithout: Math.round(avgWithout * 100) / 100,
        usageCount: withTool.length,
        recommendation,
      });
    }

    return correlations.sort((a, b) => b.avgQualityWith - a.avgQualityWith);
  } catch (err) {
    console.error("[swarm-learning] Fehler bei getToolCorrelations:", err);
    return [];
  }
}

/**
 * Aggregiert Statistiken für das Analytics-Dashboard.
 */
export async function getSwarmAnalytics(userId?: string) {
  try {
    const where = userId ? { userId } : {};

    const [total, byTaskType, avgMetrics, recentTrend] = await Promise.all([
      prisma.swarmIntelligence.count({ where }),

      prisma.swarmIntelligence.groupBy({
        by: ["taskType"],
        where,
        _avg: { qualityScore: true, creditsUsed: true, executionTimeMs: true },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),

      prisma.swarmIntelligence.aggregate({
        where,
        _avg: { qualityScore: true, creditsUsed: true, executionTimeMs: true, agentCount: true },
      }),

      // Trend: letzte 7 Tage vs. vorherige 7 Tage
      Promise.all([
        prisma.swarmIntelligence.aggregate({
          where: {
            ...where,
            createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
          },
          _avg: { qualityScore: true },
          _count: { id: true },
        }),
        prisma.swarmIntelligence.aggregate({
          where: {
            ...where,
            createdAt: {
              gte: new Date(Date.now() - 14 * 86400000),
              lt: new Date(Date.now() - 7 * 86400000),
            },
          },
          _avg: { qualityScore: true },
          _count: { id: true },
        }),
      ]),
    ]);

    const [thisWeek, lastWeek] = recentTrend;
    const qualityTrend =
      thisWeek._avg.qualityScore && lastWeek._avg.qualityScore
        ? ((thisWeek._avg.qualityScore - lastWeek._avg.qualityScore) /
            lastWeek._avg.qualityScore) *
          100
        : 0;

    return {
      totalExecutions: total,
      byTaskType: byTaskType.map((r) => ({
        taskType: r.taskType,
        count: r._count.id,
        avgQuality: Math.round((r._avg.qualityScore || 0) * 100) / 100,
        avgCredits: Math.round((r._avg.creditsUsed || 0) * 100) / 100,
        avgTimeMs: Math.round(r._avg.executionTimeMs || 0),
      })),
      averages: {
        quality: Math.round((avgMetrics._avg.qualityScore || 0) * 100) / 100,
        credits: Math.round((avgMetrics._avg.creditsUsed || 0) * 100) / 100,
        timeMs: Math.round(avgMetrics._avg.executionTimeMs || 0),
        agents: Math.round((avgMetrics._avg.agentCount || 0) * 10) / 10,
      },
      trend: {
        qualityChangePercent: Math.round(qualityTrend * 10) / 10,
        thisWeekCount: thisWeek._count.id,
        lastWeekCount: lastWeek._count.id,
      },
    };
  } catch (err) {
    console.error("[swarm-learning] Fehler bei getSwarmAnalytics:", err);
    return null;
  }
}

/**
 * Wöchentliche Optimierung: identifiziert Top-Konfigurationen und
 * bereinigt veraltete Einträge.
 */
export async function runWeeklyOptimization(): Promise<{
  processed: number;
  topConfigs: { taskType: string; avgQuality: number; sampleSize: number }[];
  pruned: number;
}> {
  try {
    // Top-Konfigurationen pro TaskType
    const topConfigs = await prisma.swarmIntelligence.groupBy({
      by: ["taskType"],
      _avg: { qualityScore: true },
      _count: { id: true },
      having: { id: { _count: { gte: 3 } } },
      orderBy: { _avg: { qualityScore: "desc" } },
    });

    // Alte Einträge mit niedriger Qualität bereinigen (> 90 Tage, Score < 0.3)
    const pruneResult = await prisma.swarmIntelligence.deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - 90 * 86400000) },
        qualityScore: { lt: 0.3 },
        userSignal: null, // Kein explizites Feedback → darf gelöscht werden
      },
    });

    const totalProcessed = await prisma.swarmIntelligence.count();

    return {
      processed: totalProcessed,
      topConfigs: topConfigs.map((r) => ({
        taskType: r.taskType,
        avgQuality: Math.round((r._avg.qualityScore || 0) * 100) / 100,
        sampleSize: r._count.id,
      })),
      pruned: pruneResult.count,
    };
  } catch (err) {
    console.error("[swarm-learning] Fehler bei runWeeklyOptimization:", err);
    return { processed: 0, topConfigs: [], pruned: 0 };
  }
}
