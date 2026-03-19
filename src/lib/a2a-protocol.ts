/**
 * A2A (Agent-to-Agent) Protocol
 * Ermöglicht Kommunikation zwischen KILN-Agents und Agents auf anderen Plattformen.
 */

export interface A2AAgentCard {
  name: string;
  description: string;
  capabilities: string[];
  endpoint: string;
  protocol: "a2a/1.0";
  authentication: "api_key" | "none";
  provider: "kiln";
  version: string;
}

export interface A2AMessage {
  task: string;
  context?: Record<string, unknown>;
  conversationId?: string;
  replyTo?: string; // sender's callback URL
}

export interface A2AResponse {
  status: "completed" | "failed" | "pending";
  response: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generiert eine A2A Agent Card für einen KILN-Agent.
 */
export function buildAgentCard(
  agentId: string,
  name: string,
  description: string,
  capabilities: string[],
  baseUrl: string
): A2AAgentCard {
  return {
    name,
    description: description || `${name} — KILN AI Agent`,
    capabilities,
    endpoint: `${baseUrl}/api/a2a/agents/${agentId}/message`,
    protocol: "a2a/1.0",
    authentication: "api_key",
    provider: "kiln",
    version: "1.0.0",
  };
}

/**
 * Entdeckt einen externen Agent über seine Card-URL.
 */
export async function discoverAgent(cardUrl: string): Promise<A2AAgentCard | null> {
  try {
    const res = await fetch(cardUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const card = await res.json() as A2AAgentCard;
    if (!card.name || !card.endpoint) return null;
    return card;
  } catch {
    return null;
  }
}

/**
 * Sendet eine Nachricht an einen externen Agent via A2A.
 */
export async function sendA2AMessage(
  targetEndpoint: string,
  message: A2AMessage,
  apiKey?: string,
  timeoutMs = 30_000
): Promise<A2AResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(targetEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    return {
      status: "failed",
      response: `A2A call failed (${res.status}): ${errText.slice(0, 200)}`,
    };
  }

  return await res.json() as A2AResponse;
}

/**
 * Leitet automatisch Capabilities aus Agent-Aktionen und Beschreibung ab.
 */
export function deriveCapabilities(
  actions: { type: string; enabled: boolean }[],
  description?: string | null
): string[] {
  const caps: string[] = [];

  for (const action of actions) {
    if (!action.enabled) continue;
    switch (action.type) {
      case "BOOK_APPOINTMENT": caps.push("appointment_booking"); break;
      case "COLLECT_EMAIL": caps.push("lead_capture"); break;
      case "SCORE_LEAD": caps.push("lead_qualification"); break;
      case "SEND_EMAIL": caps.push("email_sending"); break;
      case "FIRE_WEBHOOK": caps.push("webhook_trigger"); break;
      case "HANDOFF_HUMAN": caps.push("human_escalation"); break;
      case "HTTP_REQUEST": caps.push("api_integration"); break;
    }
  }

  // Aus Beschreibung ableiten
  if (description) {
    const lower = description.toLowerCase();
    if (lower.includes("support") || lower.includes("hilfe")) caps.push("customer_support");
    if (lower.includes("sales") || lower.includes("vertrieb")) caps.push("sales");
    if (lower.includes("onboarding")) caps.push("onboarding");
    if (lower.includes("faq")) caps.push("faq");
    if (lower.includes("research") || lower.includes("recherche")) caps.push("research");
  }

  return Array.from(new Set(caps));
}
