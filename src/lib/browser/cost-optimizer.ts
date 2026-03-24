/**
 * Pattern 6: Execution Budget Optimizer
 * Minimiert Credits pro Task durch intelligente Entscheidungen:
 * - Wann Vision (teuer) vs DOM (kostenlos) verwenden
 * - Wann Haiku (günstig) statt Sonnet (teuer) reicht
 * - Wann Screenshots übersprungen werden können
 * - Budget-Tracking und Warnung bei Überschreitung
 */

/* ── Types ── */

export interface CostDecision {
  useVision: boolean;
  model: "claude-sonnet-4-6" | "claude-haiku-4-5-20251001";
  takeScreenshot: boolean;
  reasoning: string;
  estimatedCredits: number;
}

export interface BudgetState {
  totalBudget: number;
  creditsUsed: number;
  creditsRemaining: number;
  stepsCompleted: number;
  stepsRemaining: number;
  /** Geschätzte Credits pro verbleibendem Schritt */
  estimatedPerStep: number;
  /** Ob Budget knapp wird */
  budgetTight: boolean;
  /** Ob Vision noch erlaubt ist */
  visionAllowed: boolean;
}

export interface ActionCost {
  action: string;
  model: string;
  credits: number;
  wasScreenshot: boolean;
  wasDomOnly: boolean;
}

/* ── Cost Constants ── */

const CREDIT_COSTS = {
  /** Sonnet Vision-Call (Screenshot + Reasoning) */
  sonnetVision: 3,
  /** Sonnet Text-Only Call */
  sonnetText: 2,
  /** Haiku Vision-Call */
  haikuVision: 0.5,
  /** Haiku Text-Only Call */
  haikuText: 0.25,
  /** DOM-Analyse (kein LLM) */
  domOnly: 0,
  /** Screenshot nehmen (ohne Vision-Analyse) */
  screenshot: 0.1,
} as const;

/** Aktionen die günstig (DOM-only) ausgeführt werden können */
const CHEAP_ACTIONS = new Set([
  "extract_data",
  "scroll",
  "type",
]);

/** Aktionen die Vision benötigen für gute Ergebnisse */
const VISION_PREFERRED_ACTIONS = new Set([
  "click",
  "navigate",
]);

/* ── Cost Optimizer ── */

export class CostOptimizer {
  private totalBudget: number;
  private creditsUsed = 0;
  private maxSteps: number;
  private stepsCompleted = 0;
  private actionLog: ActionCost[] = [];
  /** Aggressivität: 0.0 = maximale Qualität, 1.0 = maximale Sparsamkeit */
  private aggressiveness: number;

  constructor(totalBudget: number, maxSteps: number, aggressiveness = 0.5) {
    this.totalBudget = totalBudget;
    this.maxSteps = maxSteps;
    this.aggressiveness = Math.max(0, Math.min(1, aggressiveness));
  }

  /**
   * Entscheidet für einen Schritt ob Vision, Haiku oder DOM-only verwendet wird.
   */
  decide(
    currentAction: string,
    stepIndex: number,
    context: {
      /** Ob die Seite bereits analysiert wurde */
      pageAnalyzed: boolean;
      /** Ob Daten aus DOM extrahiert werden können */
      canExtractFromDom: boolean;
      /** Ob ein Plan existiert und der aktuelle Schritt kein Checkpoint ist */
      hasPlan: boolean;
      isCheckpoint: boolean;
      /** Ob der letzte Schritt fehlgeschlagen ist */
      lastStepFailed: boolean;
      /** Ob wir auf einer neuen Seite sind */
      isNewPage: boolean;
      /** Ob es der erste Schritt ist */
      isFirstStep: boolean;
    },
  ): CostDecision {
    const budget = this.getBudgetState();

    // Erster Schritt: immer Vision für Orientierung
    if (context.isFirstStep) {
      return {
        useVision: true,
        model: "claude-sonnet-4-6",
        takeScreenshot: true,
        reasoning: "Erster Schritt — Vision für Orientierung",
        estimatedCredits: CREDIT_COSTS.sonnetVision,
      };
    }

    // Budget erschöpft: nur noch DOM
    if (budget.creditsRemaining <= 0) {
      return {
        useVision: false,
        model: "claude-haiku-4-5-20251001",
        takeScreenshot: false,
        reasoning: "Budget erschöpft — nur DOM",
        estimatedCredits: CREDIT_COSTS.domOnly,
      };
    }

    // Letzter Schritt fehlgeschlagen: Vision zur Diagnose
    if (context.lastStepFailed) {
      return {
        useVision: true,
        model: "claude-sonnet-4-6",
        takeScreenshot: true,
        reasoning: "Fehlgeschlagener Schritt — Vision zur Diagnose",
        estimatedCredits: CREDIT_COSTS.sonnetVision,
      };
    }

    // Günstige Aktionen: DOM-only wenn möglich
    if (CHEAP_ACTIONS.has(currentAction) && context.pageAnalyzed) {
      if (currentAction === "extract_data" && context.canExtractFromDom) {
        return {
          useVision: false,
          model: "claude-haiku-4-5-20251001",
          takeScreenshot: false,
          reasoning: "Extraktion: DOM genügt",
          estimatedCredits: CREDIT_COSTS.domOnly,
        };
      }

      if (currentAction === "type" || currentAction === "scroll") {
        return {
          useVision: false,
          model: "claude-haiku-4-5-20251001",
          takeScreenshot: false,
          reasoning: `${currentAction}: kein Vision nötig`,
          estimatedCredits: CREDIT_COSTS.domOnly,
        };
      }
    }

    // Plan existiert und kein Checkpoint: überspringe Screenshot
    if (context.hasPlan && !context.isCheckpoint && !context.isNewPage) {
      return {
        useVision: false,
        model: "claude-haiku-4-5-20251001",
        takeScreenshot: false,
        reasoning: "Plan vorhanden, kein Checkpoint",
        estimatedCredits: CREDIT_COSTS.haikuText,
      };
    }

    // Neue Seite: immer Screenshot, aber Haiku wenn Budget knapp
    if (context.isNewPage) {
      if (budget.budgetTight) {
        return {
          useVision: true,
          model: "claude-haiku-4-5-20251001",
          takeScreenshot: true,
          reasoning: "Neue Seite — Haiku-Vision (Budget knapp)",
          estimatedCredits: CREDIT_COSTS.haikuVision,
        };
      }

      return {
        useVision: true,
        model: "claude-sonnet-4-6",
        takeScreenshot: true,
        reasoning: "Neue Seite — Sonnet-Vision",
        estimatedCredits: CREDIT_COSTS.sonnetVision,
      };
    }

    // Vision-bevorzugte Aktionen
    if (VISION_PREFERRED_ACTIONS.has(currentAction)) {
      if (budget.budgetTight && this.aggressiveness > 0.5) {
        return {
          useVision: false,
          model: "claude-haiku-4-5-20251001",
          takeScreenshot: false,
          reasoning: `${currentAction}: DOM-Fallback (Budget knapp)`,
          estimatedCredits: CREDIT_COSTS.haikuText,
        };
      }

      return {
        useVision: true,
        model: budget.budgetTight ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
        takeScreenshot: true,
        reasoning: `${currentAction}: Vision bevorzugt`,
        estimatedCredits: budget.budgetTight
          ? CREDIT_COSTS.haikuVision
          : CREDIT_COSTS.sonnetVision,
      };
    }

    // Default: Haiku-Text wenn Seite bekannt, Sonnet-Vision sonst
    if (context.pageAnalyzed) {
      return {
        useVision: false,
        model: "claude-haiku-4-5-20251001",
        takeScreenshot: false,
        reasoning: "Seite bekannt — Haiku-Text",
        estimatedCredits: CREDIT_COSTS.haikuText,
      };
    }

    return {
      useVision: !budget.budgetTight,
      model: budget.budgetTight ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
      takeScreenshot: !budget.budgetTight,
      reasoning: "Default-Entscheidung basierend auf Budget",
      estimatedCredits: budget.budgetTight
        ? CREDIT_COSTS.haikuText
        : CREDIT_COSTS.sonnetVision,
    };
  }

  /**
   * Registriert die tatsächlichen Kosten eines Schrittes.
   */
  recordCost(cost: ActionCost): void {
    this.actionLog.push(cost);
    this.creditsUsed += cost.credits;
    this.stepsCompleted++;
  }

  /**
   * Gibt den aktuellen Budget-Status zurück.
   */
  getBudgetState(): BudgetState {
    const remaining = Math.max(0, this.totalBudget - this.creditsUsed);
    const stepsRemaining = Math.max(0, this.maxSteps - this.stepsCompleted);
    const avgPerStep =
      this.stepsCompleted > 0
        ? this.creditsUsed / this.stepsCompleted
        : CREDIT_COSTS.sonnetVision; // Konservative Schätzung

    // Budget ist knapp wenn weniger als 2 Sonnet-Vision-Steps übrig
    const budgetTight =
      remaining < avgPerStep * 2 || remaining < CREDIT_COSTS.sonnetVision * 2;

    return {
      totalBudget: this.totalBudget,
      creditsUsed: this.creditsUsed,
      creditsRemaining: remaining,
      stepsCompleted: this.stepsCompleted,
      stepsRemaining,
      estimatedPerStep: Math.round(avgPerStep * 100) / 100,
      budgetTight,
      visionAllowed: remaining >= CREDIT_COSTS.sonnetVision,
    };
  }

  /**
   * Schätzt die verbleibenden Kosten bis zum Task-Ende.
   */
  estimateRemainingCost(stepsLeft: number): number {
    const budget = this.getBudgetState();
    return stepsLeft * budget.estimatedPerStep;
  }

  /**
   * Gibt eine Budget-Zusammenfassung zurück.
   */
  getSummary(): {
    totalBudget: number;
    creditsUsed: number;
    creditsSaved: number;
    domOnlySteps: number;
    visionSteps: number;
    haikuSteps: number;
  } {
    const domOnly = this.actionLog.filter((a) => a.wasDomOnly).length;
    const visionSteps = this.actionLog.filter((a) => a.wasScreenshot).length;
    const haikuSteps = this.actionLog.filter(
      (a) => a.model === "claude-haiku-4-5-20251001",
    ).length;

    // Geschätzte Einsparung: jeder DOM-Step statt Vision spart ~3 Credits
    const creditsSaved = domOnly * CREDIT_COSTS.sonnetVision;

    return {
      totalBudget: this.totalBudget,
      creditsUsed: this.creditsUsed,
      creditsSaved,
      domOnlySteps: domOnly,
      visionSteps,
      haikuSteps,
    };
  }
}
