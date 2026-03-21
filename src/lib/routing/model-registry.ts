/**
 * Model Registry
 * Zentrale Registry aller verfügbaren LLM-Modelle mit Metadaten, Preisen und Capabilities.
 */

/* ── Types ── */

export type ModelCapability = "reasoning" | "speed" | "vision" | "code" | "research" | "creative" | "tools";
export type ModelTierLevel = "fast" | "balanced" | "powerful";
export type ModelProviderName = "anthropic" | "openai" | "google" | "perplexity";

export interface ModelEntry {
  id: string;
  provider: ModelProviderName;
  displayName: string;
  capabilities: ModelCapability[];
  maxContext: number;
  inputPricePer1M: number;  // $ per 1M input tokens
  outputPricePer1M: number; // $ per 1M output tokens
  supportsVision: boolean;
  supportsTools: boolean;
  tier: ModelTierLevel;
  /** Wann das Modell zuletzt aktualisiert wurde */
  updatedAt: string;
}

/* ── Registry ── */

export const MODEL_REGISTRY: ModelEntry[] = [
  // Anthropic
  {
    id: "claude-opus-4-6",
    provider: "anthropic",
    displayName: "Claude Opus 4.6",
    capabilities: ["reasoning", "code", "creative", "vision", "tools"],
    maxContext: 200000,
    inputPricePer1M: 15,
    outputPricePer1M: 75,
    supportsVision: true,
    supportsTools: true,
    tier: "powerful",
    updatedAt: "2025-10-01",
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    displayName: "Claude Sonnet 4.6",
    capabilities: ["reasoning", "code", "vision", "speed", "tools"],
    maxContext: 200000,
    inputPricePer1M: 3,
    outputPricePer1M: 15,
    supportsVision: true,
    supportsTools: true,
    tier: "balanced",
    updatedAt: "2025-10-01",
  },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    displayName: "Claude Haiku 4.5",
    capabilities: ["speed", "code", "vision", "tools"],
    maxContext: 200000,
    inputPricePer1M: 0.8,
    outputPricePer1M: 4,
    supportsVision: true,
    supportsTools: true,
    tier: "fast",
    updatedAt: "2025-10-01",
  },
  // OpenAI
  {
    id: "gpt-4.1",
    provider: "openai",
    displayName: "GPT-4.1",
    capabilities: ["reasoning", "code", "vision", "tools"],
    maxContext: 1000000,
    inputPricePer1M: 2,
    outputPricePer1M: 8,
    supportsVision: true,
    supportsTools: true,
    tier: "balanced",
    updatedAt: "2025-04-14",
  },
  {
    id: "gpt-4.1-mini",
    provider: "openai",
    displayName: "GPT-4.1 Mini",
    capabilities: ["speed", "code", "tools"],
    maxContext: 1000000,
    inputPricePer1M: 0.4,
    outputPricePer1M: 1.6,
    supportsVision: true,
    supportsTools: true,
    tier: "fast",
    updatedAt: "2025-04-14",
  },
  // Google
  {
    id: "gemini-2.5-pro",
    provider: "google",
    displayName: "Gemini 2.5 Pro",
    capabilities: ["reasoning", "code", "vision", "creative"],
    maxContext: 1000000,
    inputPricePer1M: 1.25,
    outputPricePer1M: 10,
    supportsVision: true,
    supportsTools: true,
    tier: "balanced",
    updatedAt: "2025-03-25",
  },
  // Perplexity
  {
    id: "sonar-pro",
    provider: "perplexity",
    displayName: "Sonar Pro",
    capabilities: ["research", "speed"],
    maxContext: 200000,
    inputPricePer1M: 3,
    outputPricePer1M: 15,
    supportsVision: false,
    supportsTools: false,
    tier: "balanced",
    updatedAt: "2025-02-01",
  },
];

/* ── Provider API Key Mapping ── */

const PROVIDER_ENV_KEYS: Record<ModelProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

/**
 * Gibt alle Modelle zurück, für die der User API-Keys konfiguriert hat.
 */
export function getAvailableModels(
  userApiKeys?: Record<string, string | undefined>
): ModelEntry[] {
  // Wenn userApiKeys angegeben, prüfe diese. Sonst prüfe env vars.
  return MODEL_REGISTRY.filter((model) => {
    if (userApiKeys) {
      const envKey = PROVIDER_ENV_KEYS[model.provider];
      return !!userApiKeys[envKey] || !!process.env[envKey];
    }
    const envKey = PROVIDER_ENV_KEYS[model.provider];
    return !!process.env[envKey];
  });
}

/**
 * Prüft ob ein bestimmter Provider verfügbar ist.
 */
export function isProviderAvailable(provider: ModelProviderName): boolean {
  const envKey = PROVIDER_ENV_KEYS[provider];
  return !!process.env[envKey];
}

/**
 * Schätzt die Kosten für einen Aufruf.
 */
export function estimateCost(
  modelId: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): number {
  const model = MODEL_REGISTRY.find((m) => m.id === modelId);
  if (!model) return 0;

  const inputCost = (estimatedInputTokens / 1_000_000) * model.inputPricePer1M;
  const outputCost = (estimatedOutputTokens / 1_000_000) * model.outputPricePer1M;
  return Math.round((inputCost + outputCost) * 10000) / 10000; // 4 Dezimalstellen in $
}

/**
 * Findet ein Modell nach ID.
 */
export function getModelById(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

/**
 * Filtert Modelle nach Capability.
 */
export function getModelsByCapability(capability: ModelCapability): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => m.capabilities.includes(capability));
}

/**
 * Filtert Modelle nach Tier.
 */
export function getModelsByTier(tier: ModelTierLevel): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => m.tier === tier);
}

/**
 * Gibt das günstigste Modell mit einer bestimmten Capability zurück.
 */
export function getCheapestModel(capability?: ModelCapability): ModelEntry | undefined {
  const candidates = capability
    ? MODEL_REGISTRY.filter((m) => m.capabilities.includes(capability))
    : MODEL_REGISTRY;

  return candidates.sort((a, b) => a.inputPricePer1M - b.inputPricePer1M)[0];
}
