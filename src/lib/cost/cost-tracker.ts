/**
 * Cost Tracker
 * Tracks token usage, USD cost, and credits in real-time during agent/workflow execution.
 * Uses model-pricing.ts for USD costs and credits.ts for credit deduction.
 */

import { estimateCost } from "@/lib/model-pricing";
import { getCreditCost } from "@/lib/credits";

/* ── Types ── */

export interface CostEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costDollars: number;
  creditsUsed: number;
  timestamp: Date;
  stepLabel?: string;
}

export interface CostBreakdownItem {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costDollars: number;
  creditsUsed: number;
}

export interface CostSummary {
  totalCostDollars: number;
  totalCreditsUsed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  breakdown: CostBreakdownItem[];
  entries: CostEntry[];
}

export interface BudgetCheck {
  withinBudget: boolean;
  remainingCredits: number;
  percentUsed: number;
  /** Legacy — Kosten in Dollar (für Analytics) */
  remainingDollars: number;
}

/* ── Cost Calculation ── */

/**
 * Berechnet die USD-Kosten für einen LLM-Aufruf via model-pricing.ts.
 */
export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  return estimateCost(modelId, inputTokens, outputTokens);
}

/**
 * Gibt die Credit-Kosten für ein Modell zurück via credits.ts.
 */
export function calculateCredits(modelId: string): number {
  return getCreditCost(modelId);
}

/* ── CostTracker Class ── */

export class CostTracker {
  private entries: CostEntry[] = [];
  private onBudgetExceeded?: () => void;
  private userId?: string;
  private agentId?: string;
  private byokActive: boolean;

  constructor(options?: {
    onBudgetExceeded?: () => void;
    userId?: string;
    agentId?: string;
    /** BYOK = Kosten tracken aber keine Credits abziehen */
    byokActive?: boolean;
  }) {
    this.onBudgetExceeded = options?.onBudgetExceeded;
    this.userId = options?.userId;
    this.agentId = options?.agentId;
    this.byokActive = options?.byokActive ?? false;
  }

  /**
   * Trackt einen LLM-Aufruf.
   * Berechnet USD-Kosten und Credit-Kosten.
   * Zieht Credits ab (wenn userId gesetzt und kein BYOK).
   * Speichert CostRecord für Analytics.
   */
  async trackUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
    stepLabel?: string
  ): Promise<CostEntry> {
    const costDollars = calculateCost(model, inputTokens, outputTokens);
    const creditsUsed = this.byokActive ? 0 : calculateCredits(model);

    const entry: CostEntry = {
      model,
      inputTokens,
      outputTokens,
      costDollars,
      creditsUsed,
      timestamp: new Date(),
      stepLabel,
    };
    this.entries.push(entry);

    // Credits abziehen (async, non-blocking)
    if (this.userId && creditsUsed > 0) {
      try {
        const { deductCredits } = await import("@/lib/credits");
        await deductCredits(this.userId, model, "TASK_RUN", this.agentId);
      } catch {
        // Credit-Abzug fehlgeschlagen — Execution nicht abbrechen
      }
    }

    // CostRecord für Analytics speichern
    if (this.agentId) {
      saveCostRecord({
        agentId: this.agentId,
        model,
        inputTokens,
        outputTokens,
        costCents: Math.round(costDollars * 100),
        creditsUsed,
      }).catch(() => {});
    }

    return entry;
  }

  /**
   * Synchrone Variante — trackt nur lokal ohne Credit-Abzug.
   * Nützlich wenn Credits bereits anderswo abgezogen wurden.
   */
  trackUsageSync(
    model: string,
    inputTokens: number,
    outputTokens: number,
    stepLabel?: string
  ): CostEntry {
    const costDollars = calculateCost(model, inputTokens, outputTokens);
    const creditsUsed = this.byokActive ? 0 : calculateCredits(model);

    const entry: CostEntry = {
      model,
      inputTokens,
      outputTokens,
      costDollars,
      creditsUsed,
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
    let totalCreditsUsed = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const entry of this.entries) {
      totalCostDollars += entry.costDollars;
      totalCreditsUsed += entry.creditsUsed;
      totalInputTokens += entry.inputTokens;
      totalOutputTokens += entry.outputTokens;

      if (!byModel[entry.model]) {
        byModel[entry.model] = {
          model: entry.model,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          costDollars: 0,
          creditsUsed: 0,
        };
      }
      byModel[entry.model].calls++;
      byModel[entry.model].inputTokens += entry.inputTokens;
      byModel[entry.model].outputTokens += entry.outputTokens;
      byModel[entry.model].costDollars += entry.costDollars;
      byModel[entry.model].creditsUsed += entry.creditsUsed;
    }

    return {
      totalCostDollars,
      totalCreditsUsed,
      totalInputTokens,
      totalOutputTokens,
      breakdown: Object.values(byModel),
      entries: this.entries,
    };
  }

  /**
   * Prüft ob das Budget eingehalten wird (in Credits).
   */
  checkBudget(budgetCapCredits: number): BudgetCheck {
    const summary = this.getCostSoFar();
    const remainingCredits = budgetCapCredits - summary.totalCreditsUsed;
    const percentUsed = budgetCapCredits > 0
      ? (summary.totalCreditsUsed / budgetCapCredits) * 100
      : 0;

    const withinBudget = remainingCredits >= 0;
    if (!withinBudget) {
      this.onBudgetExceeded?.();
    }

    return {
      withinBudget,
      remainingCredits: Math.max(0, remainingCredits),
      percentUsed: Math.min(100, Math.round(percentUsed * 100) / 100),
      remainingDollars: Math.max(0, summary.totalCostDollars), // Legacy field
    };
  }

  /**
   * Legacy-Kompatibilität: Budget in Dollar prüfen.
   */
  checkBudgetDollars(budgetCapDollars: number): BudgetCheck {
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
      remainingCredits: 0,
      remainingDollars: Math.max(0, remaining),
      percentUsed: Math.min(100, Math.round(percentUsed * 100) / 100),
    };
  }

  get entryCount(): number {
    return this.entries.length;
  }

  reset(): void {
    this.entries = [];
  }
}

/* ── DB Helper ── */

/**
 * Speichert einen Cost-Record in der DB (für Analytics).
 */
export async function saveCostRecord(record: {
  agentId: string;
  workflowRunId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  creditsUsed?: number;
}): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.costRecord.create({
      data: {
        agentId: record.agentId,
        workflowRunId: record.workflowRunId || null,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        costCents: record.costCents,
      },
    });
  } catch {
    // Non-critical — don't break execution
  }
}
