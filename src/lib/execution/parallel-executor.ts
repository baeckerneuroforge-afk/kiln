/**
 * Parallel Executor
 * Führt Workflow-Branches parallel aus mit Dependency-DAG, Concurrency-Limits und Progress-Tracking.
 */

import { saveCheckpoint } from "@/lib/execution-persistence";
import {
  selectOptimalModel,
  detectTaskType,
} from "@/lib/smart-model-router";
import type { SubAgentTool, ModelPreference } from "./sub-agent-executor";

/* ── Types ── */

export type SubTaskComplexity = "low" | "medium" | "high";
export type ModelTier = "fast" | "balanced" | "powerful";

export interface SubTask {
  id: string;
  description: string;
  dependencies: string[];
  config: Record<string, unknown>;
  estimatedComplexity?: SubTaskComplexity;
  suggestedModelTier?: ModelTier;
  /** Tools die der Sub-Agent nutzen kann */
  tools?: SubAgentTool[];
  /** Modell-Präferenz basierend auf Task-Typ */
  modelPreference?: ModelPreference;
  /** Erwartetes Output-Format */
  outputFormat?: "text" | "json" | "table" | "file";
}

export interface SubTaskResult {
  id: string;
  status: "completed" | "failed";
  output: unknown;
  error?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  estimatedCost?: number;
  durationMs: number;
}

export interface ParallelExecutionProgress {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
}

export interface ParallelExecutionResult {
  results: SubTaskResult[];
  mergedOutput: Record<string, unknown>;
  totalDurationMs: number;
  progress: ParallelExecutionProgress;
}

export type TaskExecutor = (
  task: SubTask,
  dependencyResults: Record<string, unknown>
) => Promise<SubTaskResult>;

/* ── Concurrency Limits by Plan ── */

const PLAN_CONCURRENCY_LIMITS: Record<string, number> = {
  FREE: 2,
  STARTER: 3,
  PRO: 5,
  AGENCY: 10,
  ENTERPRISE: 10,
};

export function getMaxConcurrency(plan?: string): number {
  return PLAN_CONCURRENCY_LIMITS[plan || "FREE"] || 5;
}

/* ── Parallel Executor ── */

/** Max total agents in a single swarm (prevent explosion) */
const MAX_TOTAL_AGENTS = 30;

export class ParallelExecutor {
  private maxConcurrency: number;
  private results: Map<string, SubTaskResult> = new Map();
  private progress: ParallelExecutionProgress;
  private onProgress?: (progress: ParallelExecutionProgress) => void;
  private dynamicTasks: SubTask[] = [];
  private totalAgentCount = 0;
  private budgetExceeded = false;
  private onBudgetExceeded?: () => void;

  constructor(options: {
    maxConcurrency?: number;
    plan?: string;
    onProgress?: (progress: ParallelExecutionProgress) => void;
    onBudgetExceeded?: () => void;
  }) {
    this.maxConcurrency = options.maxConcurrency || getMaxConcurrency(options.plan);
    this.onProgress = options.onProgress;
    this.onBudgetExceeded = options.onBudgetExceeded;
    this.progress = { total: 0, completed: 0, failed: 0, running: 0, pending: 0 };
  }

  /**
   * Fügt einen dynamischen Task zur Queue hinzu (für sub-agent spawning).
   * Gibt false zurück wenn das Maximum erreicht ist.
   */
  addTask(task: SubTask): boolean {
    if (this.totalAgentCount >= MAX_TOTAL_AGENTS) return false;
    this.dynamicTasks.push(task);
    this.totalAgentCount++;
    return true;
  }

  /**
   * Signalisiert dass das Budget überschritten wurde.
   * Alle laufenden Agents werden beim nächsten Check gestoppt.
   */
  signalBudgetExceeded(): void {
    this.budgetExceeded = true;
    this.onBudgetExceeded?.();
  }

  get isBudgetExceeded(): boolean {
    return this.budgetExceeded;
  }

  get currentAgentCount(): number {
    return this.totalAgentCount;
  }

  /**
   * Führt alle Tasks aus, respektiert Abhängigkeiten und Concurrency-Limit.
   */
  async execute(
    tasks: SubTask[],
    executor: TaskExecutor,
    checkpointInfo?: { executionId: string; teamId: string; userId: string }
  ): Promise<ParallelExecutionResult> {
    const startTime = Date.now();
    this.totalAgentCount = tasks.length;
    this.dynamicTasks = [];
    this.budgetExceeded = false;

    // Mutable task list — dynamic tasks werden hier hinzugefügt
    const allTasks = [...tasks];

    this.progress = {
      total: allTasks.length,
      completed: 0,
      failed: 0,
      running: 0,
      pending: allTasks.length,
    };

    const completed = new Set<string>();
    const failed = new Set<string>();
    const running = new Set<string>();

    // Topologische Sortierung — finde ausführbare Tasks
    const getReady = (): SubTask[] => {
      return allTasks.filter((t) => {
        if (completed.has(t.id) || failed.has(t.id) || running.has(t.id)) return false;
        return t.dependencies.every((depId) => completed.has(depId));
      });
    };

    // Event-Loop: starte Tasks sobald Kapazität und Dependencies frei sind
    while (completed.size + failed.size < allTasks.length) {
      // Dynamische Tasks integrieren
      if (this.dynamicTasks.length > 0) {
        allTasks.push(...this.dynamicTasks);
        this.dynamicTasks = [];
      }

      // Budget-Check: bei Überschreitung alle verbleibenden Tasks abbrechen
      if (this.budgetExceeded && running.size === 0) {
        const remaining = allTasks.filter((t) => !completed.has(t.id) && !failed.has(t.id));
        for (const t of remaining) {
          failed.add(t.id);
          this.results.set(t.id, {
            id: t.id,
            status: "failed",
            output: null,
            error: "Budget exceeded — swarm stopped",
            durationMs: 0,
          });
        }
        break;
      }

      const ready = getReady();

      if (ready.length === 0 && running.size === 0) {
        // Deadlock: verbleibende Tasks haben unerfüllbare Abhängigkeiten
        const remaining = tasks.filter(
          (t) => !completed.has(t.id) && !failed.has(t.id)
        );
        for (const t of remaining) {
          failed.add(t.id);
          this.results.set(t.id, {
            id: t.id,
            status: "failed",
            output: null,
            error: "Unerfüllbare Abhängigkeiten (Dependency fehlgeschlagen oder zirkulär)",
            durationMs: 0,
          });
        }
        break;
      }

      // Starte so viele wie das Concurrency-Limit erlaubt
      const slotsAvailable = this.maxConcurrency - running.size;
      const toStart = ready.slice(0, slotsAvailable);

      if (toStart.length === 0) {
        // Warte auf laufende Tasks
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }

      const promises = toStart.map(async (task) => {
        running.add(task.id);
        this.updateProgress(completed.size, failed.size, running.size, tasks.length);

        // Dependency-Results sammeln
        const depResults: Record<string, unknown> = {};
        for (const depId of task.dependencies) {
          const depResult = this.results.get(depId);
          if (depResult) {
            depResults[depId] = depResult.output;
          }
        }

        try {
          const result = await executor(task, depResults);
          this.results.set(task.id, result);

          if (result.status === "completed") {
            completed.add(task.id);
          } else {
            failed.add(task.id);
          }
        } catch (err) {
          failed.add(task.id);
          this.results.set(task.id, {
            id: task.id,
            status: "failed",
            output: null,
            error: err instanceof Error ? err.message : "Task execution failed",
            durationMs: 0,
          });
        } finally {
          running.delete(task.id);
          this.updateProgress(completed.size, failed.size, running.size, allTasks.length);
        }
      });

      // Warte auf mindestens einen Abschluss via Promise.race
      await Promise.race(promises.map((p) => p.catch(() => {})));

      // Checkpoint speichern wenn gewünscht
      if (checkpointInfo && (completed.size + failed.size) % 3 === 0) {
        saveCheckpoint({
          executionId: checkpointInfo.executionId,
          teamId: checkpointInfo.teamId,
          userId: checkpointInfo.userId,
          context: {
            _parallelExecution: {
              completed: Array.from(completed),
              failed: Array.from(failed),
              results: Object.fromEntries(this.results),
            },
          },
          executedNodeIds: Array.from(completed),
          pendingQueue: allTasks.filter((t) => !completed.has(t.id) && !failed.has(t.id)).map((t) => t.id),
          completedNodes: completed.size,
          failedNodes: failed.size,
          checkpointedAt: new Date(),
          reason: "parallel_checkpoint",
        }).catch(() => {});
      }
    }

    // Ergebnisse zusammenführen
    const mergedOutput: Record<string, unknown> = {};
    this.results.forEach((result, id) => {
      mergedOutput[id] = result.output;
    });

    return {
      results: Array.from(this.results.values()),
      mergedOutput,
      totalDurationMs: Date.now() - startTime,
      progress: {
        total: allTasks.length,
        completed: completed.size,
        failed: failed.size,
        running: 0,
        pending: 0,
      },
    };
  }

  private updateProgress(completed: number, failed: number, running: number, total: number) {
    this.progress = {
      total,
      completed,
      failed,
      running,
      pending: total - completed - failed - running,
    };
    this.onProgress?.(this.progress);
  }
}

/* ── Merge Strategies ── */

export type MergeStrategy = "wait_all" | "first_success" | "majority_vote" | "custom_merge" | "synthesize";

export function mergeResults(
  results: SubTaskResult[],
  strategy: MergeStrategy
): { output: unknown; confidence: number } {
  switch (strategy) {
    case "first_success": {
      const first = results.find((r) => r.status === "completed");
      return { output: first?.output ?? null, confidence: first ? 1 : 0 };
    }

    case "majority_vote": {
      // Zähle identische Outputs
      const votes = new Map<string, { count: number; output: unknown }>();
      for (const r of results) {
        if (r.status !== "completed") continue;
        const key = JSON.stringify(r.output);
        const existing = votes.get(key);
        if (existing) {
          existing.count++;
        } else {
          votes.set(key, { count: 1, output: r.output });
        }
      }
      let best = { count: 0, output: null as unknown };
      Array.from(votes.values()).forEach((v) => {
        if (v.count > best.count) best = v;
      });
      const successCount = results.filter((r) => r.status === "completed").length;
      return {
        output: best.output,
        confidence: successCount > 0 ? best.count / successCount : 0,
      };
    }

    case "wait_all":
    default: {
      const outputs: Record<string, unknown> = {};
      for (const r of results) {
        outputs[r.id] = r.status === "completed" ? r.output : { error: r.error };
      }
      const successCount = results.filter((r) => r.status === "completed").length;
      return {
        output: outputs,
        confidence: results.length > 0 ? successCount / results.length : 0,
      };
    }
  }
}

/* ── Model Selection Helper ── */

export function selectModelForTask(task: SubTask): string {
  const tierMap: Record<ModelTier, string> = {
    fast: "claude-haiku-4-5-20251001",
    balanced: "claude-sonnet-4-6",
    powerful: "claude-opus-4-6",
  };

  if (task.suggestedModelTier) {
    return tierMap[task.suggestedModelTier] || tierMap.balanced;
  }

  // Auto-detect from description
  const taskType = detectTaskType(task.description);
  const decision = selectOptimalModel({
    taskType,
    complexity: task.estimatedComplexity === "high" ? "complex" : task.estimatedComplexity === "low" ? "simple" : "medium",
    budget: task.estimatedComplexity === "low" ? "low" : "medium",
  });

  return decision.primary.model;
}
