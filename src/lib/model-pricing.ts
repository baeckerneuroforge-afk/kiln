// Model pricing per 1M tokens (USD)
// Quelle: offizielle Preisseiten der Anbieter

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-opus-4-6": { inputPer1M: 15.0, outputPer1M: 75.0 },
  "claude-opus-4-7": { inputPer1M: 15.0, outputPer1M: 75.0 },
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-haiku-4-5-20251001": { inputPer1M: 0.8, outputPer1M: 4.0 },

  // OpenAI
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-5.4": { inputPer1M: 2.5, outputPer1M: 15.0 },

  // Perplexity
  "sonar-pro": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "sonar": { inputPer1M: 1.0, outputPer1M: 1.0 },

  // Google
  "gemini-2.0-pro": { inputPer1M: 1.25, outputPer1M: 5.0 },
  "gemini-2.0-flash": { inputPer1M: 0.075, outputPer1M: 0.3 },
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10.0 },
  "gemini-2.5-flash": { inputPer1M: 0.3, outputPer1M: 2.5 },

  // Mistral
  "mistral-small-latest": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "mistral-medium-latest": { inputPer1M: 1.5, outputPer1M: 7.5 },
  "mistral-large-latest": { inputPer1M: 0.5, outputPer1M: 1.5 },

  // Groq
  "llama-3.3-70b-versatile": { inputPer1M: 0.59, outputPer1M: 0.79 },
  "mixtral-8x7b-32768": { inputPer1M: 0.24, outputPer1M: 0.24 },
};

// Backward-compat: resolve deprecated model IDs for pricing lookup
function resolvePricingModel(model: string): string {
  // Inline mapping to avoid circular dependency with ai.ts
  const map: Record<string, string> = {
    "claude-opus-4-20250514": "claude-opus-4-7",
    "claude-sonnet-4-20250514": "claude-sonnet-4-6",
    "gpt-4.1": "gpt-4o",
    "gpt-4.1-mini": "gpt-4o-mini",
    "o3-mini": "gpt-4o-mini",
    "gpt-5": "gpt-5.4",
  };
  return map[model] || model;
}

// Berechne geschätzte Kosten für einen einzelnen LLM-Aufruf
export function estimateCost(
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  const pricing = MODEL_PRICING[resolvePricingModel(model)];
  if (!pricing) return 0;
  return (
    (tokensIn / 1_000_000) * pricing.inputPer1M +
    (tokensOut / 1_000_000) * pricing.outputPer1M
  );
}

// Referenzkosten: Was würde ein einzelner Agent mit dem teuersten Modell kosten?
export function singleAgentEquivalentCost(
  totalTokensIn: number,
  totalTokensOut: number,
  referenceModel = "claude-opus-4-6"
): number {
  return estimateCost(referenceModel, totalTokensIn, totalTokensOut);
}

// Berechne monatliche Projektion
export function projectMonthlyCost(
  costPerExecution: number,
  executionsPerMonth: number
): number {
  return costPerExecution * executionsPerMonth;
}
