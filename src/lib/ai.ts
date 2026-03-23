import Anthropic from "@anthropic-ai/sdk";

// Singleton Claude client (KILN's default key)
let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

// BYOK: Claude Client mit eigenem Key erstellen
export function getClaudeClientWithKey(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

// ===== Multi-LLM Provider & Model Configuration =====

export type ProviderKey = "ANTHROPIC" | "OPENAI" | "PERPLEXITY" | "GOOGLE" | "GROQ";

export interface ModelDef {
  id: string;
  label: string;
  shortLabel: string; // For badges: "Sonnet 4", "GPT-4o"
  provider: ProviderKey;
  badge?: string; // "Most Capable", "Fastest", etc.
  speed: 1 | 2 | 3; // 1=slow, 2=medium, 3=fast
  quality: 1 | 2 | 3; // 1=basic, 2=good, 3=best
  cost: 1 | 2 | 3; // 1=cheap, 2=moderate, 3=expensive
  supportsTools: boolean;
  supportsVision: boolean;
  requiresByok: boolean; // true = needs user's own key
}

export const PROVIDERS: Record<ProviderKey, { label: string; keyPrefix?: string; keyPlaceholder: string }> = {
  ANTHROPIC: { label: "Anthropic", keyPrefix: "sk-ant-", keyPlaceholder: "sk-ant-..." },
  OPENAI: { label: "OpenAI", keyPrefix: "sk-", keyPlaceholder: "sk-..." },
  PERPLEXITY: { label: "Perplexity", keyPrefix: "pplx-", keyPlaceholder: "pplx-..." },
  GOOGLE: { label: "Google AI", keyPrefix: "AI", keyPlaceholder: "AIza..." },
  GROQ: { label: "Groq", keyPrefix: "gsk_", keyPlaceholder: "gsk_..." },
};

export const ALL_MODELS: ModelDef[] = [
  // Anthropic
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    shortLabel: "Opus 4.6",
    provider: "ANTHROPIC",
    badge: "Most Capable",
    speed: 1, quality: 3, cost: 3,
    supportsTools: true,
    supportsVision: true,
    requiresByok: false,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    shortLabel: "Sonnet 4.6",
    provider: "ANTHROPIC",
    badge: "Best Value",
    speed: 2, quality: 3, cost: 2,
    supportsTools: true,
    supportsVision: true,
    requiresByok: false,
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    shortLabel: "Haiku 4.5",
    provider: "ANTHROPIC",
    badge: "Fastest",
    speed: 3, quality: 2, cost: 1,
    supportsTools: true,
    supportsVision: true,
    requiresByok: false,
  },
  // OpenAI
  {
    id: "gpt-4o",
    label: "GPT-4o",
    shortLabel: "GPT-4o",
    provider: "OPENAI",
    badge: "Most Capable",
    speed: 2, quality: 3, cost: 3,
    supportsTools: true,
    supportsVision: true,
    requiresByok: true,
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    shortLabel: "4o Mini",
    provider: "OPENAI",
    badge: "Best Value",
    speed: 3, quality: 2, cost: 1,
    supportsTools: true,
    supportsVision: true,
    requiresByok: true,
  },
  // Perplexity
  {
    id: "sonar-pro",
    label: "Sonar Pro",
    shortLabel: "Sonar Pro",
    provider: "PERPLEXITY",
    badge: "Best for Research",
    speed: 2, quality: 3, cost: 3,
    supportsTools: false,
    supportsVision: false,
    requiresByok: true,
  },
  {
    id: "sonar",
    label: "Sonar",
    shortLabel: "Sonar",
    provider: "PERPLEXITY",
    badge: "Best for Research",
    speed: 3, quality: 2, cost: 1,
    supportsTools: false,
    supportsVision: false,
    requiresByok: true,
  },
  // Google
  {
    id: "gemini-2.0-pro",
    label: "Gemini 2.0 Pro",
    shortLabel: "Gemini Pro",
    provider: "GOOGLE",
    badge: undefined,
    speed: 2, quality: 3, cost: 2,
    supportsTools: false,
    supportsVision: true,
    requiresByok: true,
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    shortLabel: "Gemini Flash",
    provider: "GOOGLE",
    badge: "Fastest",
    speed: 3, quality: 2, cost: 1,
    supportsTools: false,
    supportsVision: true,
    requiresByok: true,
  },
  // Groq
  {
    id: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B",
    shortLabel: "Llama 70B",
    provider: "GROQ",
    badge: "Fastest",
    speed: 3, quality: 2, cost: 1,
    supportsTools: false,
    supportsVision: false,
    requiresByok: true,
  },
  {
    id: "mixtral-8x7b-32768",
    label: "Mixtral 8x7B",
    shortLabel: "Mixtral",
    provider: "GROQ",
    badge: undefined,
    speed: 3, quality: 1, cost: 1,
    supportsTools: false,
    supportsVision: false,
    requiresByok: true,
  },
];

// Backward-compatibility: map deprecated model IDs → current IDs
export const DEPRECATED_MODEL_MAP: Record<string, string> = {
  "claude-opus-4-20250514": "claude-opus-4-6",
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "claude-3-opus-20240229": "claude-opus-4-6",
  "claude-3-sonnet-20240229": "claude-sonnet-4-6",
  "claude-3-haiku-20240307": "claude-haiku-4-5-20251001",
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
  "gpt-4-turbo": "gpt-4o",
  "gpt-4": "gpt-4o",
  "gpt-3.5-turbo": "gpt-4o-mini",
  "gpt-4.1": "gpt-4o",
  "gpt-4.1-mini": "gpt-4o-mini",
  "o3-mini": "gpt-4o-mini",
  "gemini-2.5-pro": "gemini-2.0-pro",
  "gemini-1.5-pro": "gemini-2.0-pro",
  "gemini-1.5-flash": "gemini-2.0-flash",
};

/**
 * Resolves a model ID, mapping deprecated IDs to their current equivalents.
 */
export function resolveModelId(modelId: string): string {
  return DEPRECATED_MODEL_MAP[modelId] || modelId;
}

export function getModelDef(modelId: string): ModelDef | undefined {
  const resolved = resolveModelId(modelId);
  return ALL_MODELS.find((m) => m.id === resolved);
}

export function getModelsForProvider(provider: ProviderKey): ModelDef[] {
  return ALL_MODELS.filter((m) => m.provider === provider);
}

export function modelSupportsVision(modelId: string): boolean {
  const def = getModelDef(modelId);
  return def?.supportsVision ?? false;
}

// Backwards-compatible mapping
export const MODEL_PROVIDER_MAP: Record<string, ProviderKey> = Object.fromEntries(
  ALL_MODELS.map((m) => [m.id, m.provider])
);

// Backwards-compatible list
export const AVAILABLE_MODELS = ALL_MODELS.map((m) => ({
  id: m.id,
  label: m.label,
  provider: m.provider.toLowerCase() as "anthropic" | "openai",
}));

// Team role → recommended model mapping
export const TEAM_ROLE_MODEL_RECOMMENDATIONS: Record<string, { modelId: string; reason: string }[]> = {
  HEAD: [
    { modelId: "claude-opus-4-6", reason: "Most capable for strategy and delegation" },
    { modelId: "gpt-4o", reason: "Strong reasoning for complex decisions" },
  ],
  COORDINATOR: [
    { modelId: "claude-sonnet-4-6", reason: "Best balance of speed and quality" },
  ],
  EXECUTOR_RESEARCH: [
    { modelId: "sonar-pro", reason: "Built-in web search for research tasks" },
    { modelId: "claude-sonnet-4-6", reason: "Strong analytical capabilities" },
  ],
  EXECUTOR_WRITER: [
    { modelId: "claude-sonnet-4-6", reason: "Excellent writing quality" },
    { modelId: "gpt-4o", reason: "Strong creative writing" },
  ],
  EXECUTOR_FAST: [
    { modelId: "claude-haiku-4-5-20251001", reason: "Ultra-fast responses, low cost" },
    { modelId: "llama-3.3-70b-versatile", reason: "Lightning fast via Groq inference" },
  ],
  REPORTER: [
    { modelId: "gpt-4o-mini", reason: "Cost-effective summarization" },
    { modelId: "claude-haiku-4-5-20251001", reason: "Fast, cheap reporting" },
  ],
};

// Meta-prompt for agent generation
export const AGENT_GENERATION_SYSTEM_PROMPT = `You are KILN's AI Agent Architect. Your task is to generate a complete agent configuration based on a user's description.

The user describes in natural language what their agent should be able to do. You generate a structured JSON configuration from that.

RULES:
- ALWAYS respond with valid JSON, embedded in \`\`\`json ... \`\`\` code blocks
- The system_prompt should be detailed and professional (at least 150 words)
- The personality should match the context
- Generate 3-5 suggested_questions that represent typical questions from the target audience
- The slug should be URL-friendly (lowercase, no special characters, hyphens)
- The welcome_message should be inviting and match the tone
- suggested_actions: Choose from: booking, faq, email, lead_scoring, webhook, notification, handoff
- Language: German as default, unless the user explicitly says otherwise

JSON format:
\`\`\`json
{
  "name": "Agent Name",
  "slug": "agent-name",
  "system_prompt": "Detailed system prompt...",
  "personality": {
    "tone": "friendly, professional",
    "language": "de",
    "formality": "du"
  },
  "welcome_message": "Welcome message...",
  "suggested_questions": ["Question 1?", "Question 2?", "Question 3?"],
  "suggested_actions": ["booking", "faq"]
}
\`\`\`

If the description is vague, make reasonable assumptions and explain them briefly BEFORE the JSON block.`;
