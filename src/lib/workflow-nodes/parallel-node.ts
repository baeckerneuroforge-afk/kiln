/**
 * Parallel Split & Merge Nodes
 * parallel_split: Fan-out — startet mehrere Branches gleichzeitig
 * parallel_merge: Fan-in — wartet auf Branches und merged Ergebnisse
 */

import type { ExpressionContext } from "@/lib/workflow-expressions";

/* ── Types ── */

export type ParallelMergeStrategy =
  | "concat"
  | "first_wins"
  | "all_required"
  | "wait_all"
  | "first_completed"
  | "n_of_m";

export interface ParallelSplitResult {
  /** Alle Output-Handles die aktiviert werden sollen */
  outputHandles: string[];
  contextDelta: Record<string, unknown>;
  success: boolean;
}

export interface ParallelMergeResult {
  contextDelta: Record<string, unknown>;
  success: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

/* ── Parallel Split ── */

/**
 * Führt den parallel_split Node aus.
 * Aktiviert alle ausgehenden Handles, damit nachfolgende Nodes parallel starten.
 */
export function executeParallelSplit(
  config: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: ExpressionContext
): ParallelSplitResult {
  const branchCount = Math.max(2, Math.min(5, Number(config.branches) || 3));

  // Generiere Handle-Namen: branch_0, branch_1, ...
  const outputHandles: string[] = [];
  for (let i = 0; i < branchCount; i++) {
    outputHandles.push(`branch_${i}`);
  }

  return {
    outputHandles,
    contextDelta: {
      _parallelSplit: {
        branches: branchCount,
        startedAt: new Date().toISOString(),
      },
    },
    success: true,
  };
}

/* ── Parallel Merge ── */

/**
 * Führt den parallel_merge Node aus.
 * Wartet auf eingehende Branches und merged deren Ergebnisse.
 */
export function executeParallelMerge(
  config: Record<string, unknown>,
  context: ExpressionContext,
  mergeExtra?: { branchesCompleted: number; branchesExpected: number }
): ParallelMergeResult {
  const strategy = (config.mergeStrategy as ParallelMergeStrategy) || "concat";
  const nRequired = Number(config.nRequired) || 0;
  const completed = mergeExtra?.branchesCompleted || 0;
  const expected = mergeExtra?.branchesExpected || 1;
  const resultKey = String(config.resultKey || "parallelResult");

  switch (strategy) {
    case "concat":
    case "all_required":
    case "wait_all": {
      if (completed < expected) {
        return {
          contextDelta: {},
          success: false,
          error: `Warte auf ${expected - completed} verbleibende Branches`,
          meta: { strategy, completed, expected },
        };
      }
      return {
        contextDelta: {
          [resultKey]: {
            strategy,
            branchesCompleted: completed,
            mergedAt: new Date().toISOString(),
          },
        },
        success: true,
        meta: { strategy, completed, expected },
      };
    }

    case "first_wins":
    case "first_completed": {
      if (completed >= 1) {
        return {
          contextDelta: {
            [resultKey]: {
              strategy,
              branchesCompleted: completed,
              mergedAt: new Date().toISOString(),
            },
          },
          success: true,
          meta: { strategy, completed, expected },
        };
      }
      return {
        contextDelta: {},
        success: false,
        error: "Noch kein Branch abgeschlossen",
        meta: { strategy, completed, expected },
      };
    }

    case "n_of_m": {
      const required = nRequired > 0 ? nRequired : Math.ceil(expected / 2);
      if (completed >= required) {
        return {
          contextDelta: {
            [resultKey]: {
              strategy: "n_of_m",
              required,
              branchesCompleted: completed,
              mergedAt: new Date().toISOString(),
            },
          },
          success: true,
          meta: { strategy, required, completed, expected },
        };
      }
      return {
        contextDelta: {},
        success: false,
        error: `Benötige ${required - completed} weitere Branches (${completed}/${required})`,
        meta: { strategy, required, completed, expected },
      };
    }

    default:
      return {
        contextDelta: {},
        success: false,
        error: `Unbekannte Merge-Strategie: ${strategy}`,
      };
  }
}
