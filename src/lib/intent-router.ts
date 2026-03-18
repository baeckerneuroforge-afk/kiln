import { getClaudeClient } from "@/lib/ai";

export interface IntentAgent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
}

export interface IntentResult {
  agentId: string;
  confidence: number;
  intent: string;
}

const INTENT_MODEL = "claude-haiku-4-5-20251001";

/**
 * Detect user intent and match to the best agent in a team.
 * Uses a fast Haiku call to classify the message.
 */
export async function detectIntent(
  message: string,
  currentAgentId: string,
  availableAgents: IntentAgent[],
  conversationContext?: string
): Promise<IntentResult> {
  if (availableAgents.length <= 1) {
    return {
      agentId: currentAgentId,
      confidence: 1.0,
      intent: "default",
    };
  }

  const client = getClaudeClient();

  const agentDescriptions = availableAgents
    .map(
      (a) =>
        `- ID: "${a.id}" | Name: "${a.name}" | Specialty: ${a.description || extractSpecialty(a.systemPrompt)}`
    )
    .join("\n");

  const response = await client.messages.create({
    model: INTENT_MODEL,
    max_tokens: 200,
    system: `You classify user messages to route them to the best agent. Given available agents and a user message, determine which agent should handle it.

Return ONLY a JSON object: {"agentId": "<id>", "confidence": <0.0-1.0>, "intent": "<short intent label>"}

Rules:
- confidence 0.9-1.0: Message clearly belongs to this agent's specialty
- confidence 0.6-0.8: Message likely fits, but not certain
- confidence below 0.5: Keep with current agent
- If the message is general/greeting/unclear, return the current agent with low confidence
- Intent should be a short label like "pricing", "support", "booking", "technical", "general"`,
    messages: [
      {
        role: "user",
        content: `Current agent ID: "${currentAgentId}"

Available agents:
${agentDescriptions}

${conversationContext ? `Recent conversation context: ${conversationContext}\n` : ""}User message: "${message}"

Which agent should handle this?`,
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return { agentId: currentAgentId, confidence: 0.0, intent: "unknown" };
  }

  try {
    const result = JSON.parse(jsonMatch[0]) as {
      agentId: string;
      confidence: number;
      intent: string;
    };

    // Validate the agentId exists
    const validIds = new Set(availableAgents.map((a) => a.id));
    if (!validIds.has(result.agentId)) {
      return { agentId: currentAgentId, confidence: 0.0, intent: result.intent || "unknown" };
    }

    return {
      agentId: result.agentId,
      confidence: Math.max(0, Math.min(1, result.confidence)),
      intent: result.intent || "unknown",
    };
  } catch {
    return { agentId: currentAgentId, confidence: 0.0, intent: "unknown" };
  }
}

/**
 * Extract a short specialty description from a system prompt.
 */
function extractSpecialty(systemPrompt: string): string {
  // Take first 150 chars of system prompt as specialty hint
  const firstSentence = systemPrompt.split(/[.!?\n]/)[0]?.trim() || "";
  return firstSentence.slice(0, 150) || "General assistant";
}

/**
 * Determine if a topic shift has occurred by comparing
 * the new intent with the previous one.
 */
export function hasTopicShifted(
  newIntent: string,
  previousIntent: string | null
): boolean {
  if (!previousIntent) return true;
  if (newIntent === "general" || newIntent === "unknown") return false;
  return newIntent !== previousIntent;
}

/**
 * Load team agents for intent routing.
 */
export async function loadTeamAgentsForRouting(
  teamId: string
): Promise<IntentAgent[]> {
  const { prisma } = await import("@/lib/prisma");

  const members = await prisma.agentTeamMember.findMany({
    where: { teamId, agent: { isNot: null } },
    include: {
      agent: {
        select: {
          id: true,
          name: true,
          description: true,
          systemPrompt: true,
        },
      },
    },
  });

  return members
    .filter((m) => m.agent !== null)
    .map((m) => ({
      id: m.agent!.id,
      name: m.agent!.name,
      description: m.agent!.description,
      systemPrompt: m.agent!.systemPrompt,
    }));
}
