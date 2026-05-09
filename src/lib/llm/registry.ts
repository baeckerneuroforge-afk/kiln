import type { LlmModel, LlmProvider, ModelTier } from "./types";

// Pricing snapshot: May 2026. Sources checked against official provider
// pricing/model pages during this sprint. Re-verify before changing public
// billing guarantees because model aliases and promo prices move quickly.
export const MODEL_CATALOG: LlmModel[] = [
  {
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    tier: "FAST",
    inputTokenPriceUsdPer1M: 0.8,
    outputTokenPriceUsdPer1M: 4,
    contextWindowTokens: 200_000,
    supportsCaching: true,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    tier: "BALANCED",
    inputTokenPriceUsdPer1M: 3,
    outputTokenPriceUsdPer1M: 15,
    contextWindowTokens: 200_000,
    supportsCaching: true,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "anthropic",
    modelId: "claude-opus-4-7",
    tier: "SMART",
    inputTokenPriceUsdPer1M: 15,
    outputTokenPriceUsdPer1M: 75,
    contextWindowTokens: 200_000,
    supportsCaching: true,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "openai",
    modelId: "gpt-4o-mini",
    tier: "FAST",
    inputTokenPriceUsdPer1M: 0.15,
    outputTokenPriceUsdPer1M: 0.6,
    contextWindowTokens: 128_000,
    supportsCaching: true,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "openai",
    modelId: "gpt-4o",
    tier: "BALANCED",
    inputTokenPriceUsdPer1M: 2.5,
    outputTokenPriceUsdPer1M: 10,
    contextWindowTokens: 128_000,
    supportsCaching: true,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "openai",
    modelId: "gpt-5.4",
    tier: "SMART",
    inputTokenPriceUsdPer1M: 2.5,
    outputTokenPriceUsdPer1M: 15,
    contextWindowTokens: 272_000,
    supportsCaching: true,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "google",
    modelId: "gemini-2.5-flash",
    tier: "FAST",
    inputTokenPriceUsdPer1M: 0.3,
    outputTokenPriceUsdPer1M: 2.5,
    contextWindowTokens: 1_000_000,
    supportsCaching: true,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "google",
    modelId: "gemini-2.5-pro",
    tier: "BALANCED",
    inputTokenPriceUsdPer1M: 1.25,
    outputTokenPriceUsdPer1M: 10,
    contextWindowTokens: 1_000_000,
    supportsCaching: true,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "mistral",
    modelId: "mistral-small-latest",
    tier: "FAST",
    inputTokenPriceUsdPer1M: 0.15,
    outputTokenPriceUsdPer1M: 0.6,
    contextWindowTokens: 256_000,
    supportsCaching: false,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "mistral",
    modelId: "mistral-medium-latest",
    tier: "BALANCED",
    inputTokenPriceUsdPer1M: 1.5,
    outputTokenPriceUsdPer1M: 7.5,
    contextWindowTokens: 256_000,
    supportsCaching: false,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "mistral",
    modelId: "mistral-large-latest",
    tier: "SMART",
    inputTokenPriceUsdPer1M: 0.5,
    outputTokenPriceUsdPer1M: 1.5,
    contextWindowTokens: 256_000,
    supportsCaching: false,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
  {
    provider: "groq",
    modelId: "llama-3.3-70b-versatile",
    tier: "FAST",
    inputTokenPriceUsdPer1M: 0.59,
    outputTokenPriceUsdPer1M: 0.79,
    contextWindowTokens: 131_072,
    supportsCaching: false,
    supportsToolUse: true,
    supportsJsonMode: true,
  },
];

const MODEL_ALIASES: Record<string, string> = {
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "claude-opus-4-20250514": "claude-opus-4-7",
  "claude-opus-4-6": "claude-opus-4-7",
  "gpt-5": "gpt-5.4",
  "gpt-4-turbo": "gpt-4o",
  "gpt-4.1": "gpt-4o",
  "gpt-4.1-mini": "gpt-4o-mini",
  "o3-mini": "gpt-4o-mini",
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-2.0-pro": "gemini-2.5-pro",
  "mistral-small-2603": "mistral-small-latest",
  "mistral-medium-3-5": "mistral-medium-latest",
  "mistral-large-2512": "mistral-large-latest",
  "llama-3.3-70b": "llama-3.3-70b-versatile",
};

export function resolveModelAlias(modelId: string): string {
  return MODEL_ALIASES[modelId] ?? modelId;
}

export function getModelsByTier(tier: ModelTier): LlmModel[] {
  return MODEL_CATALOG.filter((model) => model.tier === tier).sort(compareModelCost);
}

export function getModelsByProvider(provider: LlmProvider): LlmModel[] {
  return MODEL_CATALOG.filter((model) => model.provider === provider).sort(compareModelCost);
}

export function getModelById(modelId: string): LlmModel | null {
  const resolved = resolveModelAlias(modelId);
  return MODEL_CATALOG.find((model) => model.modelId === resolved) ?? null;
}

export function getDefaultModelForTier(
  tier: ModelTier,
  preferredProvider?: LlmProvider,
): LlmModel {
  const providerMatch = preferredProvider
    ? getModelsByTier(tier).find((model) => model.provider === preferredProvider)
    : null;
  if (providerMatch) return providerMatch;

  const tierModels = getModelsByTier(tier);
  if (tierModels[0]) return tierModels[0];

  const balanced = getModelsByTier("BALANCED")[0];
  if (!balanced) throw new Error("No LLM models are registered.");
  return balanced;
}

export function findEquivalentModel(model: LlmModel, provider: LlmProvider): LlmModel | null {
  const sameTier = MODEL_CATALOG.find(
    (candidate) => candidate.provider === provider && candidate.tier === model.tier,
  );
  if (sameTier) return sameTier;

  const providerModels = getModelsByProvider(provider);
  if (providerModels.length === 0) return null;
  if (model.tier === "SMART") {
    return providerModels[providerModels.length - 1] ?? null;
  }
  if (model.tier === "BALANCED") {
    return providerModels.find((candidate) => candidate.tier === "BALANCED")
      ?? providerModels.find((candidate) => candidate.tier === "SMART")
      ?? providerModels[0]
      ?? null;
  }
  return providerModels[0] ?? null;
}

export function getProviderEnvVars(provider: LlmProvider): string[] {
  switch (provider) {
    case "anthropic":
      return ["ANTHROPIC_API_KEY"];
    case "openai":
      return ["OPENAI_API_KEY"];
    case "google":
      return ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"];
    case "mistral":
      return ["MISTRAL_API_KEY"];
    case "groq":
      return ["GROQ_API_KEY"];
  }
}

function compareModelCost(a: LlmModel, b: LlmModel): number {
  const aBlended = a.inputTokenPriceUsdPer1M + a.outputTokenPriceUsdPer1M * 0.4;
  const bBlended = b.inputTokenPriceUsdPer1M + b.outputTokenPriceUsdPer1M * 0.4;
  return aBlended - bBlended;
}
