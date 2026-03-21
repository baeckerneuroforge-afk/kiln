/**
 * Agent Swarm Node
 * Zerlegt ein Ziel in parallele Sub-Tasks und führt sie mit individuellen LLM-Aufrufen aus.
 * Mächtiger als spawn_helper: mehrere Agents, Merge-Strategien, Progress-Tracking.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ExpressionContext } from "@/lib/workflow-expressions";
import { resolveExpression } from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import {
  ParallelExecutor,
  mergeResults,
  selectModelForTask,
  type SubTask,
  type SubTaskResult,
  type MergeStrategy,
  type ParallelExecutionProgress,
} from "@/lib/execution/parallel-executor";
import { decomposeGoal } from "@/lib/execution/task-decomposer";
import { trackModelCost, detectTaskType } from "@/lib/smart-model-router";

/* ── Config ── */

export interface AgentSwarmConfig {
  goal: string;
  maxAgents: number;
  maxParallel: number;
  mergeStrategy: MergeStrategy;
  timeoutPerAgent: number; // seconds
  systemPromptOverride?: string;
  customMergePrompt?: string;
}

/* ── Executor ── */

export async function executeAgentSwarm(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult & { swarmProgress?: ParallelExecutionProgress }> {
  const swarmConfig: AgentSwarmConfig = {
    goal: resolveExpression(String(config.goal || ""), context),
    maxAgents: Math.min(Math.max(Number(config.maxAgents) || 5, 2), 20),
    maxParallel: Math.min(Math.max(Number(config.maxParallel) || 3, 2), 10),
    mergeStrategy: (config.mergeStrategy as MergeStrategy) || "wait_all",
    timeoutPerAgent: Number(config.timeoutPerAgent) || 60,
    systemPromptOverride: config.systemPromptOverride ? String(config.systemPromptOverride) : undefined,
    customMergePrompt: config.customMergePrompt ? String(config.customMergePrompt) : undefined,
  };

  if (!swarmConfig.goal) {
    return { contextDelta: {}, success: false, error: "Kein Ziel für den Agent Swarm definiert" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { contextDelta: {}, success: false, error: "ANTHROPIC_API_KEY nicht konfiguriert" };
  }

  try {
    // 1. Task-Zerlegung
    const decomposition = await decomposeGoal(swarmConfig.goal, {
      maxTasks: swarmConfig.maxAgents,
    });

    const tasks = decomposition.tasks;

    // 2. Parallel-Ausführung
    let latestProgress: ParallelExecutionProgress = {
      total: tasks.length,
      completed: 0,
      failed: 0,
      running: 0,
      pending: tasks.length,
    };

    const executor = new ParallelExecutor({
      maxConcurrency: swarmConfig.maxParallel,
      onProgress: (p) => { latestProgress = p; },
    });

    const anthropic = new Anthropic({ apiKey });
    const systemPrompt = swarmConfig.systemPromptOverride ||
      "Du bist ein spezialisierter Agent in einem KILN AI Swarm. Löse die gegebene Aufgabe präzise und effizient. Antworte direkt und sachlich.";

    const result = await executor.execute(tasks, async (task, depResults) => {
      return executeSwarmAgent(anthropic, task, depResults, systemPrompt, swarmConfig.timeoutPerAgent, context);
    });

    // 3. Ergebnisse mergen
    const completedResults = result.results.filter((r) => r.status === "completed");

    let mergedOutput: unknown;

    if (swarmConfig.mergeStrategy === "custom_merge" && swarmConfig.customMergePrompt && completedResults.length > 0) {
      mergedOutput = await customMerge(anthropic, completedResults, swarmConfig.customMergePrompt, swarmConfig.goal);
    } else {
      const merged = mergeResults(result.results, swarmConfig.mergeStrategy);
      mergedOutput = merged.output;
    }

    const totalTokensIn = result.results.reduce((sum, r) => sum + (r.tokensIn || 0), 0);
    const totalTokensOut = result.results.reduce((sum, r) => sum + (r.tokensOut || 0), 0);
    const totalCost = result.results.reduce((sum, r) => sum + (r.estimatedCost || 0), 0);

    const resultKey = String(config.resultKey || "swarmResult");

    return {
      contextDelta: {
        [resultKey]: mergedOutput,
        [`${resultKey}_meta`]: {
          totalAgents: tasks.length,
          completedAgents: completedResults.length,
          failedAgents: result.results.filter((r) => r.status === "failed").length,
          totalDurationMs: result.totalDurationMs,
          totalTokensIn,
          totalTokensOut,
          totalCost,
          mergeStrategy: swarmConfig.mergeStrategy,
          executionPlan: decomposition.executionPlan,
        },
      },
      success: completedResults.length > 0,
      error: completedResults.length === 0 ? "Alle Swarm-Agents fehlgeschlagen" : undefined,
      meta: {
        totalAgents: tasks.length,
        completed: completedResults.length,
        failed: result.results.filter((r) => r.status === "failed").length,
        durationMs: result.totalDurationMs,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        cost: totalCost,
      },
      swarmProgress: latestProgress,
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Agent Swarm fehlgeschlagen",
    };
  }
}

/* ── Single Swarm Agent ── */

async function executeSwarmAgent(
  anthropic: Anthropic,
  task: SubTask,
  depResults: Record<string, unknown>,
  systemPrompt: string,
  timeoutSec: number,
  context: ExpressionContext
): Promise<SubTaskResult> {
  const startTime = Date.now();
  const model = selectModelForTask(task);

  const contextSummary = JSON.stringify(
    Object.fromEntries(
      Object.entries(context as Record<string, unknown>).filter(([k]) => !k.startsWith("_"))
    )
  ).slice(0, 1500);

  let userContent = `Aufgabe: ${task.description}`;
  if (Object.keys(depResults).length > 0) {
    userContent += `\n\nErgebnisse vorheriger Schritte:\n${JSON.stringify(depResults, null, 2).slice(0, 1000)}`;
  }
  userContent += `\n\nKontext: ${contextSummary}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSec * 1000);

    const response = await anthropic.messages.create(
      {
        model: model.startsWith("claude-") ? model : "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const output = response.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? (b as { text: string }).text : ""))
      .join("");

    const tokensIn = response.usage?.input_tokens || 0;
    const tokensOut = response.usage?.output_tokens || 0;
    const estimatedCost = (tokensIn * 0.001 + tokensOut * 0.005) / 1000;

    trackModelCost({
      model,
      provider: "anthropic",
      tokensIn,
      tokensOut,
      estimatedCost,
      taskType: detectTaskType(task.description),
      timestamp: new Date(),
    });

    return {
      id: task.id,
      status: "completed",
      output,
      model,
      tokensIn,
      tokensOut,
      estimatedCost,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      id: task.id,
      status: "failed",
      output: null,
      error: err instanceof Error ? err.message : "Agent fehlgeschlagen",
      model,
      durationMs: Date.now() - startTime,
    };
  }
}

/* ── Custom Merge ── */

async function customMerge(
  anthropic: Anthropic,
  results: SubTaskResult[],
  mergePrompt: string,
  goal: string
): Promise<string> {
  const resultsSummary = results.map((r) => `[${r.id}]: ${String(r.output).slice(0, 500)}`).join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: "Du bist ein Merge-Agent. Konsolidiere die Ergebnisse mehrerer paralleler Agents in ein kohärentes Ergebnis.",
    messages: [{
      role: "user",
      content: `Ziel: ${goal}\n\nMerge-Anweisung: ${mergePrompt}\n\nAgent-Ergebnisse:\n${resultsSummary}`,
    }],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? (b as { text: string }).text : ""))
    .join("");
}
