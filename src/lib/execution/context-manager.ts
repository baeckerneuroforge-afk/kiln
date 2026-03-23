/**
 * Context Window Manager
 * Trackt und verwaltet Context-Window-Nutzung pro Modell.
 * Schätzt Token-Counts und empfiehlt passende Modelle.
 */

/* ── Model Context Limits ── */

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Anthropic
  "claude-opus-4-6": 200000,
  "claude-sonnet-4-6": 200000,
  "claude-haiku-4-5-20251001": 200000,
  // Legacy Anthropic IDs
  "claude-sonnet-4-20250514": 200000,
  // OpenAI
  "gpt-4.1": 1000000,
  "gpt-4.1-mini": 1000000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  // Google
  "gemini-2.5-pro": 1000000,
  "gemini-2.5-flash": 1000000,
  // Perplexity
  "sonar-pro": 200000,
};

// Kosten pro 1K Input-Tokens (USD)
const MODEL_INPUT_COSTS: Record<string, number> = {
  "claude-opus-4-6": 0.015,
  "claude-sonnet-4-6": 0.003,
  "claude-haiku-4-5-20251001": 0.0008,
  "gpt-4.1": 0.002,
  "gpt-4.1-mini": 0.0004,
  "gpt-4o": 0.005,
  "gpt-4o-mini": 0.00015,
  "gemini-2.5-pro": 0.00125,
  "gemini-2.5-flash": 0.000075,
  "sonar-pro": 0.003,
};

/* ── Public API ── */

/**
 * Gibt das maximale Context-Window für ein Modell zurück.
 */
export function getModelContextLimit(model: string): number {
  return MODEL_CONTEXT_LIMITS[model] || 200000;
}

/**
 * Grobe Token-Schätzung basierend auf Content-Typ.
 * - Text: ~1.3 Tokens pro Wort / ~4 Chars pro Token
 * - Screenshots: ~1500 Tokens pro 1280x720 Bild
 * - JSON: ~1.5 Tokens pro Wort (strukturierter Content)
 */
export function estimateTokens(content: string): number {
  if (!content) return 0;

  // Base64-encoded Bilder erkennen
  const imageMatches = content.match(
    /data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/g
  );
  const imageTokens = (imageMatches?.length || 0) * 1500;

  // Text ohne Bilder
  const textOnly = content.replace(
    /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,
    ""
  );
  const wordCount = textOnly.split(/\s+/).filter(Boolean).length;

  // JSON-heavy Content hat mehr Tokens pro Wort
  const isJsonHeavy = (textOnly.match(/[{}\[\]":,]/g)?.length || 0) > wordCount * 0.3;
  const multiplier = isJsonHeavy ? 1.5 : 1.3;

  return Math.ceil(wordCount * multiplier) + imageTokens;
}

/**
 * Schätzt Token-Count für ein Array von Nachrichten.
 */
export function estimateMessagesTokens(
  messages: Array<{ content: string }>
): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/**
 * Prüft ob der Context > 80% des Modell-Limits erreicht hat.
 */
export function shouldCompact(
  messages: Array<{ content: string }>,
  model: string
): boolean {
  const limit = getModelContextLimit(model);
  const used = estimateMessagesTokens(messages);
  return used > limit * 0.8;
}

/**
 * Empfiehlt das günstigste Modell das den benötigten Context-Umfang unterstützt.
 * Berücksichtigt Vision-Anforderungen.
 */
export function recommendModel(
  requiredContextSize: number,
  options?: { requiresVision?: boolean }
): { model: string; reason: string } | null {
  const candidates = Object.entries(MODEL_CONTEXT_LIMITS)
    .filter(([, limit]) => limit >= requiredContextSize)
    .filter(([model]) => {
      if (!options?.requiresVision) return true;
      // Perplexity unterstützt kein Vision
      return model !== "sonar-pro";
    })
    .map(([model, limit]) => ({
      model,
      limit,
      cost: MODEL_INPUT_COSTS[model] || 999,
    }))
    .sort((a, b) => a.cost - b.cost);

  if (candidates.length === 0) return null;

  const best = candidates[0];
  return {
    model: best.model,
    reason: `Günstigstes Modell mit ${best.limit.toLocaleString()} Token Context (benötigt: ${requiredContextSize.toLocaleString()})`,
  };
}

/**
 * Prüft ob ein gewähltes Modell den Context-Umfang unterstützt.
 * Wenn nicht, gibt es ein alternatives Modell zurück.
 */
export function validateModelForContext(
  selectedModel: string,
  estimatedContextSize: number
): { valid: boolean; override?: string; reason?: string } {
  const limit = getModelContextLimit(selectedModel);

  if (estimatedContextSize <= limit) {
    return { valid: true };
  }

  const alternative = recommendModel(estimatedContextSize);
  if (!alternative) {
    return {
      valid: false,
      reason: `Context-Größe ${estimatedContextSize.toLocaleString()} überschreitet alle verfügbaren Modelle`,
    };
  }

  return {
    valid: false,
    override: alternative.model,
    reason: `Gewechselt von ${selectedModel} zu ${alternative.model}: Context-Größe ${estimatedContextSize.toLocaleString()} überschreitet ${selectedModel} Limit (${limit.toLocaleString()})`,
  };
}
