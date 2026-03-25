/**
 * Cost Estimator
 * Schätzt Kosten (Credits + USD) vor Ausführung eines Workflows/Tasks.
 */

import { estimateCost, MODEL_PRICING } from "@/lib/model-pricing";
import { getCreditCost, MODEL_CREDIT_COSTS } from "@/lib/credits";

/* ── Types ── */

export interface StepEstimate {
  stepName: string;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCredits: number;
  estimatedCostDollars: number;
}

export interface CostEstimate {
  totalCredits: number;
  totalCostDollars: number;
  steps: StepEstimate[];
  /** Min Credits (günstigstes Modell) */
  minCredits: number;
  /** Max Credits (teuerstes Modell) */
  maxCredits: number;
  /** Empfehlung ob genug Credits vorhanden */
  affordable: boolean;
  availableCredits: number;
}

/* ── Defaults ── */

/** Durchschnittliche Tokens pro Schritt-Typ */
const STEP_TOKEN_ESTIMATES: Record<string, { input: number; output: number }> = {
  // Agent Chat
  chat: { input: 2000, output: 500 },
  // Computer Use
  computer_analyze: { input: 5000, output: 800 },
  computer_action: { input: 3000, output: 400 },
  // Code Sandbox
  code_generate: { input: 3000, output: 1500 },
  code_execute: { input: 1000, output: 500 },
  // Verification
  verification: { input: 2000, output: 200 },
  // Default
  default: { input: 2000, output: 500 },
};

/* ── Estimator Functions ── */

/**
 * Schätzt die Kosten eines einzelnen LLM-Aufrufs.
 */
export function estimateStepCost(
  model: string,
  stepType: string = "default",
  customTokens?: { input: number; output: number },
): StepEstimate {
  const tokens = customTokens || STEP_TOKEN_ESTIMATES[stepType] || STEP_TOKEN_ESTIMATES.default;

  return {
    stepName: stepType,
    model,
    estimatedInputTokens: tokens.input,
    estimatedOutputTokens: tokens.output,
    estimatedCredits: getCreditCost(model),
    estimatedCostDollars: estimateCost(model, tokens.input, tokens.output),
  };
}

/**
 * Schätzt die Kosten für eine Computer Use Session.
 * Basiert auf geschätzter Anzahl Schritte.
 * Mit Smart Element Targeting werden ~60% der Steps DOM-basiert (0 Credits).
 */
export function estimateComputerUseCost(
  model: string = "claude-sonnet-4-6",
  estimatedSteps: number = 10,
  enableVerification: boolean = true,
  useSmartTargeting: boolean = true,
): CostEstimate {
  const steps: StepEstimate[] = [];

  // Initiale Analyse (immer Vision-basiert)
  steps.push(estimateStepCost(model, "computer_analyze"));

  // Mit Smart Element Targeting: ~60% der Steps brauchen kein Vision
  // (DOM-basierte Clicks/Types/Scrolls → 0 extra Credits)
  const visionStepRatio = useSmartTargeting ? 0.4 : 1.0;

  for (let i = 0; i < estimatedSteps; i++) {
    if (i / estimatedSteps < visionStepRatio) {
      // Dieser Step braucht Vision (Navigation, unbekannte Elemente)
      steps.push(estimateStepCost(model, "computer_action"));
    }
    // DOM-basierte Steps: nur Verification wenn aktiviert
    if (enableVerification && i / estimatedSteps < visionStepRatio) {
      steps.push(estimateStepCost("claude-haiku-4-5-20251001", "verification"));
    }
  }

  return aggregateEstimate(steps);
}

/**
 * Schätzt die Kosten für einen Code Sandbox Lauf.
 */
export function estimateCodeSandboxCost(
  model: string = "claude-sonnet-4-6",
  estimatedIterations: number = 3,
): CostEstimate {
  const steps: StepEstimate[] = [];

  for (let i = 0; i < estimatedIterations; i++) {
    steps.push(estimateStepCost(model, "code_generate"));
    steps.push(estimateStepCost(model, "code_execute"));
  }

  return aggregateEstimate(steps);
}

/**
 * Schätzt die Kosten für einen Agent Swarm Lauf.
 * Mit Smart Element Targeting werden Computer Use Steps günstiger.
 */
export function estimateSwarmCost(
  models: string[],
  estimatedCallsPerAgent: number = 3,
  hasComputerUse: boolean = false,
): CostEstimate {
  const steps: StepEstimate[] = [];

  for (const model of models) {
    // Bei Computer Use: ~40% der Calls brauchen Vision
    const effectiveCalls = hasComputerUse
      ? Math.ceil(estimatedCallsPerAgent * 0.6)
      : estimatedCallsPerAgent;

    for (let i = 0; i < effectiveCalls; i++) {
      steps.push(estimateStepCost(model, hasComputerUse ? "computer_action" : "chat"));
    }
  }

  // Orchestrator-Aufrufe
  steps.push(estimateStepCost("claude-sonnet-4-6", "chat"));
  steps.push(estimateStepCost("claude-sonnet-4-6", "chat"));

  return aggregateEstimate(steps);
}

/**
 * Generische Schätzung basierend auf Modell und Anzahl Aufrufe.
 */
export function estimateGenericCost(
  model: string,
  estimatedCalls: number,
  stepType: string = "chat",
): CostEstimate {
  const steps: StepEstimate[] = [];
  for (let i = 0; i < estimatedCalls; i++) {
    steps.push(estimateStepCost(model, stepType));
  }
  return aggregateEstimate(steps);
}

/**
 * Gibt die günstigste und teuerste Credit-Option zurück.
 */
export function getCreditRange(): { cheapest: { model: string; credits: number }; mostExpensive: { model: string; credits: number } } {
  const entries = Object.entries(MODEL_CREDIT_COSTS);
  const sorted = entries.sort(([, a], [, b]) => a - b);
  return {
    cheapest: { model: sorted[0][0], credits: sorted[0][1] },
    mostExpensive: { model: sorted[sorted.length - 1][0], credits: sorted[sorted.length - 1][1] },
  };
}

/**
 * Listet alle verfügbaren Modelle mit Credit-Kosten und USD-Kosten.
 */
export function getModelCostOverview(): Array<{
  model: string;
  credits: number;
  inputPer1M: number;
  outputPer1M: number;
}> {
  return Object.entries(MODEL_CREDIT_COSTS)
    .map(([model, credits]) => {
      const pricing = MODEL_PRICING[model];
      return {
        model,
        credits,
        inputPer1M: pricing?.inputPer1M ?? 0,
        outputPer1M: pricing?.outputPer1M ?? 0,
      };
    })
    .sort((a, b) => a.credits - b.credits);
}

/* ── Internal ── */

function aggregateEstimate(steps: StepEstimate[], availableCredits: number = Infinity): CostEstimate {
  let totalCredits = 0;
  let totalCostDollars = 0;

  for (const step of steps) {
    totalCredits += step.estimatedCredits;
    totalCostDollars += step.estimatedCostDollars;
  }

  // Min/Max: was wäre mit dem günstigsten/teuersten Modell?
  const range = getCreditRange();
  const minCredits = steps.length * range.cheapest.credits;
  const maxCredits = steps.length * range.mostExpensive.credits;

  return {
    totalCredits,
    totalCostDollars: Math.round(totalCostDollars * 1_000_000) / 1_000_000,
    steps,
    minCredits,
    maxCredits,
    affordable: availableCredits >= totalCredits,
    availableCredits,
  };
}

/**
 * Prüft ob ein User genug Credits für eine geschätzte Ausführung hat.
 */
export async function canAffordExecution(
  userId: string,
  estimate: CostEstimate,
  hasByokKey: boolean = false,
): Promise<{ affordable: boolean; balance: number; shortfall: number }> {
  if (hasByokKey) {
    return { affordable: true, balance: Infinity, shortfall: 0 };
  }

  try {
    // Admin bypass
    const { isAdmin } = await import("@/lib/admin");
    if (isAdmin(userId)) {
      return { affordable: true, balance: 999999, shortfall: 0 };
    }

    const { checkCredits } = await import("@/lib/credits");
    const result = await checkCredits(userId, "claude-haiku-4-5-20251001", hasByokKey);

    if (result.byokActive) {
      return { affordable: true, balance: result.balance, shortfall: 0 };
    }

    const shortfall = Math.max(0, estimate.totalCredits - result.balance);
    return {
      affordable: result.balance >= estimate.totalCredits,
      balance: result.balance,
      shortfall,
    };
  } catch {
    // Fehler → optimistisch erlauben
    return { affordable: true, balance: 0, shortfall: 0 };
  }
}
