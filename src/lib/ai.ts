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

// Model-Mapping: welcher Provider für welches Model
export const MODEL_PROVIDER_MAP: Record<string, "anthropic" | "openai"> = {
  "claude-sonnet-4-20250514": "anthropic",
  "claude-opus-4-20250514": "anthropic",
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
};

// Verfügbare Modelle für die UI
export const AVAILABLE_MODELS = [
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet", provider: "anthropic" as const },
  { id: "claude-opus-4-20250514", label: "Claude Opus", provider: "anthropic" as const },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" as const },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" as const },
];

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
