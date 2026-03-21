/**
 * Budget Manager
 * Per-run and per-month budget caps for agents.
 * Integrates with smart-model-router: when budget is tight, prefer cheaper models.
 */

import { calculateCost } from "./cost-tracker";

/* ── Types ── */

export type BudgetExceededBehavior = "pause" | "downgrade" | "notify_continue";

export interface AgentBudgetConfig {
  maxCostPerRunCents: number | null; // null = unlimited
  monthlyCostCapCents: number | null; // null = unlimited
  budgetExceededBehavior: BudgetExceededBehavior;
}

export interface BudgetStatus {
  runBudget: {
    enabled: boolean;
    capCents: number;
    usedCents: number;
    remainingCents: number;
    percentUsed: number;
  } | null;
  monthlyBudget: {
    enabled: boolean;
    capCents: number;
    usedCents: number;
    remainingCents: number;
    percentUsed: number;
  } | null;
  shouldDowngrade: boolean;
  shouldPause: boolean;
}

/* ── BudgetManager Class ── */

export class BudgetManager {
  private config: AgentBudgetConfig;
  private runCostCents: number = 0;
  private monthlyCostCents: number;
  private paused: boolean = false;

  constructor(config: AgentBudgetConfig, currentMonthlyCostCents: number = 0) {
    this.config = config;
    this.monthlyCostCents = currentMonthlyCostCents;
  }

  /**
   * Prüft ob ein geplanter LLM-Aufruf innerhalb des Budgets liegt.
   * Gibt die empfohlene Aktion zurück.
   */
  preCheck(
    modelId: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): { allowed: boolean; action: "proceed" | "downgrade" | "pause" | "notify"; reason?: string } {
    const estimatedCostDollars = calculateCost(modelId, estimatedInputTokens, estimatedOutputTokens);
    const estimatedCostCents = estimatedCostDollars * 100;

    // Run-Budget prüfen
    if (this.config.maxCostPerRunCents !== null) {
      const newRunTotal = this.runCostCents + estimatedCostCents;
      if (newRunTotal > this.config.maxCostPerRunCents) {
        return this.handleExceeded("Run-Budget überschritten");
      }
      // Warnung bei >80%
      if (newRunTotal > this.config.maxCostPerRunCents * 0.8) {
        return { allowed: true, action: "downgrade", reason: "Run-Budget >80% — günstigeres Modell empfohlen" };
      }
    }

    // Monats-Budget prüfen
    if (this.config.monthlyCostCapCents !== null) {
      const newMonthlyTotal = this.monthlyCostCents + estimatedCostCents;
      if (newMonthlyTotal > this.config.monthlyCostCapCents) {
        return this.handleExceeded("Monats-Budget überschritten");
      }
      if (newMonthlyTotal > this.config.monthlyCostCapCents * 0.8) {
        return { allowed: true, action: "downgrade", reason: "Monats-Budget >80% — günstigeres Modell empfohlen" };
      }
    }

    return { allowed: true, action: "proceed" };
  }

  /**
   * Trackt tatsächliche Kosten nach einem LLM-Aufruf.
   */
  trackCost(costCents: number): void {
    this.runCostCents += costCents;
    this.monthlyCostCents += costCents;
  }

  /**
   * Gibt den aktuellen Budget-Status zurück.
   */
  getStatus(): BudgetStatus {
    const runBudget = this.config.maxCostPerRunCents !== null ? {
      enabled: true,
      capCents: this.config.maxCostPerRunCents,
      usedCents: Math.round(this.runCostCents * 100) / 100,
      remainingCents: Math.max(0, this.config.maxCostPerRunCents - this.runCostCents),
      percentUsed: this.config.maxCostPerRunCents > 0
        ? Math.min(100, Math.round((this.runCostCents / this.config.maxCostPerRunCents) * 10000) / 100)
        : 0,
    } : null;

    const monthlyBudget = this.config.monthlyCostCapCents !== null ? {
      enabled: true,
      capCents: this.config.monthlyCostCapCents,
      usedCents: Math.round(this.monthlyCostCents * 100) / 100,
      remainingCents: Math.max(0, this.config.monthlyCostCapCents - this.monthlyCostCents),
      percentUsed: this.config.monthlyCostCapCents > 0
        ? Math.min(100, Math.round((this.monthlyCostCents / this.config.monthlyCostCapCents) * 10000) / 100)
        : 0,
    } : null;

    const shouldDowngrade =
      (runBudget !== null && runBudget.percentUsed > 80) ||
      (monthlyBudget !== null && monthlyBudget.percentUsed > 80);

    return {
      runBudget,
      monthlyBudget,
      shouldDowngrade,
      shouldPause: this.paused,
    };
  }

  get isPaused(): boolean {
    return this.paused;
  }

  private handleExceeded(reason: string): { allowed: boolean; action: "downgrade" | "pause" | "notify"; reason: string } {
    switch (this.config.budgetExceededBehavior) {
      case "pause":
        this.paused = true;
        return { allowed: false, action: "pause", reason };
      case "downgrade":
        return { allowed: true, action: "downgrade", reason };
      case "notify_continue":
        return { allowed: true, action: "notify", reason };
    }
  }
}

/* ── DB Helpers ── */

/**
 * Lädt die monatlichen Kosten eines Agents aus der DB.
 */
export async function getMonthlyUsageCents(agentId: string): Promise<number> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const result = await prisma.costRecord.aggregate({
      where: {
        agentId,
        timestamp: { gte: startOfMonth },
      },
      _sum: { costCents: true },
    });

    return result._sum.costCents || 0;
  } catch {
    return 0;
  }
}

/**
 * Speichert einen Cost-Record in der DB.
 */
export async function saveCostRecord(record: {
  agentId: string;
  workflowRunId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
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

/**
 * Lädt die Budget-Config eines Agents aus der DB.
 * Gibt null zurück wenn keine Budget-Limits gesetzt sind.
 */
export async function loadAgentBudgetConfig(agentId: string): Promise<AgentBudgetConfig | null> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        maxCostPerRunCents: true,
        monthlyCostCapCents: true,
        budgetExceededBehavior: true,
      },
    });

    if (!agent) return null;

    // Wenn weder Run noch Monthly gesetzt → kein Budget
    if (agent.maxCostPerRunCents === null && agent.monthlyCostCapCents === null) {
      return null;
    }

    return {
      maxCostPerRunCents: agent.maxCostPerRunCents,
      monthlyCostCapCents: agent.monthlyCostCapCents,
      budgetExceededBehavior: (agent.budgetExceededBehavior as BudgetExceededBehavior) || "notify_continue",
    };
  } catch {
    return null;
  }
}
