/**
 * Agent Swarm Node — V2.0
 * Echtes Multi-Agent-System mit Tool-Zugriff, Shared Workspace,
 * Inter-Agent-Kommunikation, dynamischem Spawning und intelligentem Merge.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ExpressionContext } from "@/lib/workflow-expressions";
import { resolveExpression } from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import {
  ParallelExecutor,
  mergeResults,
  type SubTask,
  type SubTaskResult,
  type MergeStrategy,
  type ParallelExecutionProgress,
} from "@/lib/execution/parallel-executor";
import { decomposeGoal, type DecompositionResult } from "@/lib/execution/task-decomposer";
import { SharedWorkspace } from "@/lib/execution/shared-workspace";
import { SwarmEventStream } from "@/lib/execution/swarm-event-stream";
import { SubAgentExecutor, type SubAgentConfig, type SubAgentResult } from "@/lib/execution/sub-agent-executor";
import { IntelligentMerge, type IntelligentMergeStrategy, type IntelligentMergeResult } from "@/lib/execution/intelligent-merge";
import { CostTracker } from "@/lib/cost/cost-tracker";

/* ── Config ── */

export interface AgentSwarmConfig {
  goal: string;
  maxAgents: number;
  maxParallel: number;
  mergeStrategy: MergeStrategy | IntelligentMergeStrategy;
  timeoutPerAgent: number; // seconds
  systemPromptOverride?: string;
  customMergePrompt?: string;
  /** Budget-Cap in Credits für den gesamten Swarm */
  budgetCredits?: number;
  /** Agent ID für MCP-Tool-Zugriff */
  mcpAgentId?: string;
  /** User ID für Cost-Tracking */
  userId?: string;
  /** Agent ID für Cost-Tracking */
  agentId?: string;
  /** Optional: bereits vorbereitete Task-Zerlegung */
  taskDecomposition?: DecompositionResult;
  /** Optional: externes Event-Stream-Objekt für Live-Streaming */
  eventStream?: SwarmEventStream;
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
    mergeStrategy: (config.mergeStrategy as MergeStrategy) || "synthesize",
    timeoutPerAgent: Number(config.timeoutPerAgent) || 120,
    systemPromptOverride: config.systemPromptOverride ? String(config.systemPromptOverride) : undefined,
    customMergePrompt: config.customMergePrompt ? String(config.customMergePrompt) : undefined,
    budgetCredits: config.budgetCredits ? Number(config.budgetCredits) : undefined,
    mcpAgentId: config.mcpAgentId ? String(config.mcpAgentId) : undefined,
    userId: config.userId ? String(config.userId) : undefined,
    agentId: config.agentId ? String(config.agentId) : undefined,
    taskDecomposition: config.taskDecomposition as DecompositionResult | undefined,
    eventStream: config.eventStream as SwarmEventStream | undefined,
  };

  if (!swarmConfig.goal) {
    return { contextDelta: {}, success: false, error: "Kein Ziel für den Agent Swarm definiert" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { contextDelta: {}, success: false, error: "ANTHROPIC_API_KEY nicht konfiguriert" };
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const swarmId = `swarm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Shared systems initialisieren
    const workspace = new SharedWorkspace(swarmId);
    const eventStream = swarmConfig.eventStream || new SwarmEventStream();
    const costTracker = new CostTracker({
      userId: swarmConfig.userId,
      agentId: swarmConfig.agentId,
    });

    // 1. Task-Zerlegung
    const decomposition = swarmConfig.taskDecomposition || await decomposeGoal(swarmConfig.goal, {
      maxTasks: swarmConfig.maxAgents,
      availableTools: ["computer_use", "code_sandbox", "mcp", "deep_research", "web_search"],
    });

    const tasks = decomposition.tasks;
    eventStream.swarmStarted(tasks.length, swarmConfig.goal);

    // 2. Parallel-Ausführung mit Tool-Zugriff
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
      onBudgetExceeded: () => {
        console.warn(`Swarm ${swarmId}: budget exceeded, stopping agents`);
      },
    });

    // Sub-Agent-Ergebnisse sammeln (für Intelligent Merge)
    const subAgentResults: SubAgentResult[] = [];

    const result = await executor.execute(tasks, async (task) => {
      return executeSwarmSubAgent(
        anthropic,
        task,
        workspace,
        eventStream,
        costTracker,
        executor,
        swarmConfig
      ).then((subResult) => {
        subAgentResults.push(subResult);

        // Budget-Check nach jedem Agent
        if (swarmConfig.budgetCredits) {
          const budget = costTracker.checkBudget(swarmConfig.budgetCredits);
          if (!budget.withinBudget) {
            executor.signalBudgetExceeded();
          }
        }

        return {
          id: subResult.id,
          status: "completed" as const,
          output: subResult.result,
          model: subResult.modelUsed,
          tokensIn: subResult.tokensUsed.input,
          tokensOut: subResult.tokensUsed.output,
          estimatedCost: subResult.cost,
          durationMs: 0,
        } satisfies SubTaskResult;
      }).catch((err) => ({
        id: task.id,
        status: "failed" as const,
        output: null,
        error: err instanceof Error ? err.message : "Sub-agent failed",
        durationMs: 0,
      } satisfies SubTaskResult));
    });

    // 3. Ergebnisse mergen
    const mergeStrategy = swarmConfig.mergeStrategy;
    let mergedOutput: unknown;
    let mergeQualityScore: number | undefined;
    let mergeConflicts: unknown[] = [];

    const intelligentStrategies: IntelligentMergeStrategy[] = ["synthesize", "best_quality", "wait_all", "first_success", "majority_vote"];
    if (intelligentStrategies.includes(mergeStrategy as IntelligentMergeStrategy) && subAgentResults.length > 0) {
      const intelligentMerge = new IntelligentMerge(costTracker, eventStream);
      const mergeResult: IntelligentMergeResult = await intelligentMerge.merge(
        mergeStrategy as IntelligentMergeStrategy,
        workspace,
        swarmConfig.goal,
        subAgentResults,
        anthropic
      );
      mergedOutput = mergeResult.mergedResult;
      mergeQualityScore = mergeResult.qualityScore;
      mergeConflicts = mergeResult.conflicts;
    } else if (mergeStrategy === "custom_merge" && swarmConfig.customMergePrompt) {
      const completedResults = result.results.filter((r) => r.status === "completed");
      if (completedResults.length > 0) {
        mergedOutput = await customMerge(anthropic, completedResults, swarmConfig.customMergePrompt, swarmConfig.goal);
      }
    } else {
      const merged = mergeResults(result.results, mergeStrategy as MergeStrategy);
      mergedOutput = merged.output;
    }

    // Kosten-Summary
    const costSummary = costTracker.getCostSoFar();
    const totalToolCalls = subAgentResults.reduce((sum, r) => sum + r.toolCallsCount, 0);
    const dynamicAgentsSpawned = executor.currentAgentCount - tasks.length;

    eventStream.swarmCompleted(
      costSummary.totalCostDollars,
      executor.currentAgentCount,
      result.totalDurationMs,
      mergeQualityScore || 0
    );

    const resultKey = String(config.resultKey || "swarmResult");

    return {
      contextDelta: {
        [resultKey]: mergedOutput,
        [`${resultKey}_meta`]: {
          totalAgents: executor.currentAgentCount,
          initialAgents: tasks.length,
          dynamicAgentsSpawned,
          completedAgents: subAgentResults.filter((r) => r.stoppedReason === "completed").length,
          failedAgents: result.results.filter((r) => r.status === "failed").length,
          totalDurationMs: result.totalDurationMs,
          totalTokensIn: costSummary.totalInputTokens,
          totalTokensOut: costSummary.totalOutputTokens,
          totalCost: costSummary.totalCostDollars,
          totalCreditsUsed: costSummary.totalCreditsUsed,
          totalToolCalls,
          mergeStrategy,
          mergeQualityScore,
          mergeConflicts,
          executionPlan: decomposition.executionPlan,
          workspaceSnapshot: workspace.getSnapshot(),
          eventLog: eventStream.getEventLog(),
        },
      },
      success: subAgentResults.length > 0,
      error: subAgentResults.length === 0 ? "Alle Swarm-Agents fehlgeschlagen" : undefined,
      meta: {
        totalAgents: executor.currentAgentCount,
        completed: subAgentResults.filter((r) => r.stoppedReason === "completed").length,
        failed: result.results.filter((r) => r.status === "failed").length,
        durationMs: result.totalDurationMs,
        tokensIn: costSummary.totalInputTokens,
        tokensOut: costSummary.totalOutputTokens,
        cost: costSummary.totalCostDollars,
        totalToolCalls,
        dynamicAgentsSpawned,
        mergeQualityScore,
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

/* ── Single Swarm Sub-Agent (V2: mit Tool-Zugriff) ── */

async function executeSwarmSubAgent(
  anthropic: Anthropic,
  task: SubTask,
  workspace: SharedWorkspace,
  eventStream: SwarmEventStream,
  costTracker: CostTracker,
  executor: ParallelExecutor,
  swarmConfig: AgentSwarmConfig,
): Promise<SubAgentResult> {
  const subAgentConfig: SubAgentConfig = {
    id: task.id,
    description: task.description,
    tools: task.tools || [],
    modelPreference: task.modelPreference,
    estimatedComplexity: task.estimatedComplexity,
    outputFormat: task.outputFormat,
    maxIterations: 10,
    budgetCredits: swarmConfig.budgetCredits
      ? Math.round((swarmConfig.budgetCredits / (swarmConfig.maxAgents || 5)) * 1.5)
      : undefined,
  };

  // Spawn-Handler: dynamisch neue Tasks zum ParallelExecutor hinzufügen
  const spawnHandler = (request: { task: string; tools: SubAgentConfig["tools"]; priority?: string }, parentId: string) => {
    const spawnId = `spawned_${parentId}_${Date.now()}`;
    const newTask: SubTask = {
      id: spawnId,
      description: request.task,
      dependencies: [],
      config: {},
      estimatedComplexity: "medium",
      tools: request.tools,
    };
    executor.addTask(newTask);
  };

  const subAgent = new SubAgentExecutor(subAgentConfig, costTracker, {
    spawnHandler,
    mcpAgentId: swarmConfig.mcpAgentId,
  });

  return subAgent.execute(workspace, eventStream, anthropic);
}

/* ── Legacy: Custom Merge ── */

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
