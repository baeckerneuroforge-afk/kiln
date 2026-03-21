/**
 * Budget Manager
 * Per-run budget caps in credits. Monthly budget = plan credits (from credits.ts).
 * Integrates with smart-model-router: when budget is tight, prefer cheaper models.
 */

import { calculateCost, calculateCredits } from "./cost-tracker";

/* ── Types ── */

export type BudgetExceededBehavior = "pause" | "downgrade" | "notify_continue";

export interface AgentBudgetConfig {
  /** Max Credits pro Ausführung. null = unlimited */
  maxCreditsPerRun: number | null;
  /** Legacy: Max Kosten pro Run in Cents (für Abwärtskompatibilität) */
  maxCostPerRunCents: number | null;
  budgetExceededBehavior: BudgetExceededBehavior;
}

export interface BudgetStatus {
  runBudget: {
    enabled: boolean;
    capCredits: number;
    usedCredits: number;
    remainingCredits: number;
    percentUsed: number;
    /** USD-Kosten für Analytics */
    usedDollars: number;
  } | null;
  planCredits: {
    balance: number;
    total: number;
    percentUsed: number;
  } | null;
  shouldDowngrade: boolean;
  shouldPause: boolean;
}

/* ── BudgetManager Class ── */

export class BudgetManager {
  private config: AgentBudgetConfig;
  private runCreditsUsed: number = 0;
  private runCostDollars: number = 0;
  private planCreditsBalance: number;
  private planCreditsTotal: number;
  private paused: boolean = false;
  private byokActive: boolean;

  constructor(
    config: AgentBudgetConfig,
    planCreditsBalance: number = Infinity,
    planCreditsTotal: number = Infinity,
    byokActive: boolean = false,
  ) {
    this.config = config;
    this.planCreditsBalance = planCreditsBalance;
    this.planCreditsTotal = planCreditsTotal;
    this.byokActive = byokActive;
  }

  /**
   * Prüft ob ein geplanter LLM-Aufruf innerhalb des Budgets liegt.
   */
  preCheck(
    modelId: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): { allowed: boolean; action: "proceed" | "downgrade" | "pause" | "notify"; reason?: string } {
    // BYOK = immer erlaubt (Credits werden nicht abgezogen)
    if (this.byokActive) {
      return { allowed: true, action: "proceed" };
    }

    const estimatedCredits = calculateCredits(modelId);

    // Run-Budget prüfen (in Credits)
    if (this.config.maxCreditsPerRun !== null) {
      const newRunTotal = this.runCreditsUsed + estimatedCredits;
      if (newRunTotal > this.config.maxCreditsPerRun) {
        return this.handleExceeded("Run-Budget überschritten");
      }
      if (newRunTotal > this.config.maxCreditsPerRun * 0.8) {
        return { allowed: true, action: "downgrade", reason: "Run-Budget >80% — günstigeres Modell empfohlen" };
      }
    }

    // Legacy: Run-Budget in Cents prüfen (Abwärtskompatibilität)
    if (this.config.maxCostPerRunCents !== null && this.config.maxCreditsPerRun === null) {
      const estimatedCostDollars = calculateCost(modelId, estimatedInputTokens, estimatedOutputTokens);
      const estimatedCostCents = estimatedCostDollars * 100;
      const newRunTotal = (this.runCostDollars * 100) + estimatedCostCents;
      if (newRunTotal > this.config.maxCostPerRunCents) {
        return this.handleExceeded("Run-Budget überschritten");
      }
      if (newRunTotal > this.config.maxCostPerRunCents * 0.8) {
        return { allowed: true, action: "downgrade", reason: "Run-Budget >80% — günstigeres Modell empfohlen" };
      }
    }

    // Plan-Credits prüfen (ersetzt monatliches Budget)
    if (this.planCreditsBalance !== Infinity) {
      if (this.planCreditsBalance < estimatedCredits) {
        return { allowed: false, action: "pause", reason: "Keine Credits mehr verfügbar" };
      }
      const percentUsed = this.planCreditsTotal > 0
        ? ((this.planCreditsTotal - this.planCreditsBalance) / this.planCreditsTotal) * 100
        : 0;
      if (percentUsed > 80) {
        return { allowed: true, action: "downgrade", reason: "Plan-Credits >80% — günstigeres Modell empfohlen" };
      }
    }

    return { allowed: true, action: "proceed" };
  }

  /**
   * Trackt tatsächliche Kosten nach einem LLM-Aufruf.
   */
  trackCost(modelId: string, inputTokens: number, outputTokens: number): void {
    const credits = this.byokActive ? 0 : calculateCredits(modelId);
    const costDollars = calculateCost(modelId, inputTokens, outputTokens);

    this.runCreditsUsed += credits;
    this.runCostDollars += costDollars;

    // Plan-Credits aktualisieren (lokales Tracking, echte Deduktion passiert in CostTracker)
    if (!this.byokActive && this.planCreditsBalance !== Infinity) {
      this.planCreditsBalance = Math.max(0, this.planCreditsBalance - credits);
    }
  }

  /**
   * Legacy: Trackt Kosten in Cents.
   */
  trackCostCents(costCents: number): void {
    this.runCostDollars += costCents / 100;
  }

  /**
   * Gibt den aktuellen Budget-Status zurück.
   */
  getStatus(): BudgetStatus {
    const runBudget = this.config.maxCreditsPerRun !== null ? {
      enabled: true,
      capCredits: this.config.maxCreditsPerRun,
      usedCredits: this.runCreditsUsed,
      remainingCredits: Math.max(0, this.config.maxCreditsPerRun - this.runCreditsUsed),
      percentUsed: this.config.maxCreditsPerRun > 0
        ? Math.min(100, Math.round((this.runCreditsUsed / this.config.maxCreditsPerRun) * 10000) / 100)
        : 0,
      usedDollars: this.runCostDollars,
    } : null;

    const planCredits = this.planCreditsBalance !== Infinity ? {
      balance: this.planCreditsBalance,
      total: this.planCreditsTotal,
      percentUsed: this.planCreditsTotal > 0
        ? Math.min(100, Math.round(((this.planCreditsTotal - this.planCreditsBalance) / this.planCreditsTotal) * 10000) / 100)
        : 0,
    } : null;

    const shouldDowngrade =
      (runBudget !== null && runBudget.percentUsed > 80) ||
      (planCredits !== null && planCredits.percentUsed > 80);

    return {
      runBudget,
      planCredits,
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
 * Lädt die Budget-Config eines Agents aus der DB.
 */
export async function loadAgentBudgetConfig(agentId: string): Promise<AgentBudgetConfig | null> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        maxCreditsPerRun: true,
        maxCostPerRunCents: true,
        budgetExceededBehavior: true,
      },
    });

    if (!agent) return null;

    // Wenn nichts gesetzt → kein Budget
    if (agent.maxCreditsPerRun === null && agent.maxCostPerRunCents === null) {
      return null;
    }

    return {
      maxCreditsPerRun: agent.maxCreditsPerRun ?? null,
      maxCostPerRunCents: agent.maxCostPerRunCents ?? null,
      budgetExceededBehavior: (agent.budgetExceededBehavior as BudgetExceededBehavior) || "notify_continue",
    };
  } catch {
    return null;
  }
}

/**
 * Lädt den Credit-Stand eines Users für BudgetManager-Initialisierung.
 */
export async function getUserCreditBalance(userId: string): Promise<{ balance: number; total: number; byokActive: boolean }> {
  try {
    const { checkCredits } = await import("@/lib/credits");
    // Dummy-Check mit günstigstem Modell um Balance zu bekommen
    const result = await checkCredits(userId, "claude-haiku-4-5-20251001", false);
    return {
      balance: result.balance,
      total: result.balance, // Wird vom Aufrufer ggf. überschrieben
      byokActive: result.byokActive,
    };
  } catch {
    return { balance: Infinity, total: Infinity, byokActive: false };
  }
}

/**
 * Speichert einen Cost-Record in der DB (re-export für Abwärtskompatibilität).
 */
export { saveCostRecord } from "./cost-tracker";

/**
 * Lädt die monatlichen Kosten eines Agents (für Analytics).
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
