/**
 * Model Registry
 * Zentrale Registry aller verfügbaren LLM-Modelle mit Metadaten, Preisen und Capabilities.
 */

/* ── Types ── */

export type ModelCapability = "reasoning" | "speed" | "vision" | "code" | "research" | "creative" | "tools";
export type ModelTierLevel = "fast" | "balanced" | "powerful";
export type ModelProviderName = "anthropic" | "openai" | "google" | "perplexity" | "groq";

export interface ModelEntry {
  id: string;
  provider: ModelProviderName;
  displayName: string;
  capabilities: ModelCapability[];
  maxContext: number;
  maxOutput?: number; // Max output tokens pro Aufruf
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
    maxContext: 1000000,
    maxOutput: 128000,
    inputPricePer1M: 5,
    outputPricePer1M: 25,
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
    maxContext: 1000000,
    maxOutput: 64000,
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
    id: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    capabilities: ["reasoning", "code", "vision", "tools"],
    maxContext: 128000,
    inputPricePer1M: 2.5,
    outputPricePer1M: 10,
    supportsVision: true,
    supportsTools: true,
    tier: "balanced",
    updatedAt: "2026-01-01",
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    displayName: "GPT-4o Mini",
    capabilities: ["speed", "code", "vision", "tools"],
    maxContext: 128000,
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
    supportsVision: true,
    supportsTools: true,
    tier: "fast",
    updatedAt: "2026-01-01",
  },
  // Google
  {
    id: "gemini-2.0-pro",
    provider: "google",
    displayName: "Gemini 2.0 Pro",
    capabilities: ["reasoning", "code", "vision", "creative"],
    maxContext: 2000000,
    inputPricePer1M: 1.25,
    outputPricePer1M: 5,
    supportsVision: true,
    supportsTools: true,
    tier: "balanced",
    updatedAt: "2026-01-01",
  },
  {
    id: "gemini-2.0-flash",
    provider: "google",
    displayName: "Gemini 2.0 Flash",
    capabilities: ["speed", "vision"],
    maxContext: 1000000,
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.3,
    supportsVision: true,
    supportsTools: false,
    tier: "fast",
    updatedAt: "2026-01-01",
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
  // Groq
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    displayName: "Llama 3.3 70B",
    capabilities: ["speed", "code"],
    maxContext: 128000,
    inputPricePer1M: 0.59,
    outputPricePer1M: 0.79,
    supportsVision: false,
    supportsTools: false,
    tier: "fast",
    updatedAt: "2026-01-01",
  },
  {
    id: "mixtral-8x7b-32768",
    provider: "groq",
    displayName: "Mixtral 8x7B",
    capabilities: ["speed"],
    maxContext: 32000,
    inputPricePer1M: 0.24,
    outputPricePer1M: 0.24,
    supportsVision: false,
    supportsTools: false,
    tier: "fast",
    updatedAt: "2026-01-01",
  },
];

/* ── Provider API Key Mapping ── */

const PROVIDER_ENV_KEYS: Record<ModelProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  groq: "GROQ_API_KEY",
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
