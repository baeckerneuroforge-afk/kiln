/**
 * Cost Tracker
 * Tracks token usage and cost in real-time during any agent/workflow execution.
 * Uses model-registry for accurate pricing.
 */

import { MODEL_REGISTRY, type ModelEntry } from "@/lib/routing/model-registry";

/* ── Types ── */

export interface CostEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costDollars: number;
  timestamp: Date;
  stepLabel?: string;
}

export interface CostBreakdownItem {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costDollars: number;
}

export interface CostSummary {
  totalCostDollars: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  breakdown: CostBreakdownItem[];
  entries: CostEntry[];
}

export interface BudgetCheck {
  withinBudget: boolean;
  remainingDollars: number;
  percentUsed: number;
}

/* ── Pricing Lookup ── */

const pricingCache = new Map<string, ModelEntry>();

function getModelPricing(modelId: string): ModelEntry | undefined {
  if (pricingCache.has(modelId)) return pricingCache.get(modelId);
  const entry = MODEL_REGISTRY.find((m) => m.id === modelId);
  if (entry) pricingCache.set(modelId, entry);
  return entry;
}

/**
 * Berechnet die Kosten für einen LLM-Aufruf.
 */
export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(modelId);
  if (!pricing) return 0;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePer1M;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 Dezimalstellen
}

/* ── CostTracker Class ── */

export class CostTracker {
  private entries: CostEntry[] = [];
  private onBudgetExceeded?: () => void;

  constructor(options?: { onBudgetExceeded?: () => void }) {
    this.onBudgetExceeded = options?.onBudgetExceeded;
  }

  /**
   * Trackt einen LLM-Aufruf.
   */
  trackUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
    stepLabel?: string
  ): CostEntry {
    const costDollars = calculateCost(model, inputTokens, outputTokens);
    const entry: CostEntry = {
      model,
      inputTokens,
      outputTokens,
      costDollars,
      timestamp: new Date(),
      stepLabel,
    };
    this.entries.push(entry);
    return entry;
  }

  /**
   * Gibt die bisherigen Kosten zurück.
   */
  getCostSoFar(): CostSummary {
    const byModel: Record<string, CostBreakdownItem> = {};
    let totalCostDollars = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const entry of this.entries) {
      totalCostDollars += entry.costDollars;
      totalInputTokens += entry.inputTokens;
      totalOutputTokens += entry.outputTokens;

      if (!byModel[entry.model]) {
        byModel[entry.model] = {
          model: entry.model,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          costDollars: 0,
        };
      }
      byModel[entry.model].calls++;
      byModel[entry.model].inputTokens += entry.inputTokens;
      byModel[entry.model].outputTokens += entry.outputTokens;
      byModel[entry.model].costDollars += entry.costDollars;
    }

    return {
      totalCostDollars,
      totalInputTokens,
      totalOutputTokens,
      breakdown: Object.values(byModel),
      entries: this.entries,
    };
  }

  /**
   * Prüft ob das Budget eingehalten wird.
   * @param budgetCapDollars Budget-Cap in Dollar
   */
  checkBudget(budgetCapDollars: number): BudgetCheck {
    const summary = this.getCostSoFar();
    const remaining = budgetCapDollars - summary.totalCostDollars;
    const percentUsed = budgetCapDollars > 0
      ? (summary.totalCostDollars / budgetCapDollars) * 100
      : 0;

    const withinBudget = remaining >= 0;
    if (!withinBudget) {
      this.onBudgetExceeded?.();
    }

    return {
      withinBudget,
      remainingDollars: Math.max(0, remaining),
      percentUsed: Math.min(100, Math.round(percentUsed * 100) / 100),
    };
  }

  /**
   * Gibt die Anzahl der getrackten Einträge zurück.
   */
  get entryCount(): number {
    return this.entries.length;
  }

  /**
   * Setzt den Tracker zurück.
   */
  reset(): void {
    this.entries = [];
  }
}
