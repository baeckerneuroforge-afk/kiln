/**
 * A2A (Agent-to-Agent) Protocol V1.0
 * Ermöglicht Kommunikation zwischen KILN-Agents und Agents auf anderen Plattformen.
 * V1.0: Directory, Secure Auth, Full Context Passing, Billing.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/* ── Types ── */

export interface A2AAgentCard {
  name: string;
  description: string;
  capabilities: string[];
  endpoint: string;
  protocol: "a2a/1.0";
  authentication: "api_key";
  provider: "kiln";
  version: string;
  category?: string;
  creditCost: number;
  rating: number;
  usageCount: number;
}

export interface A2AContext {
  conversationHistory?: { role: string; content: string }[];
  visitorInfo?: {
    name?: string;
    email?: string;
    previousTopics?: string[];
  };
  sourceAgent?: {
    name: string;
    platform: string;
    capabilities?: string[];
  };
  taskType?: "question" | "action" | "handoff";
  priority?: "low" | "normal" | "high" | "urgent";
}

export interface A2AMessage {
  task: string;
  context?: A2AContext;
  conversationId?: string;
  replyTo?: string;
  callerUserId?: string; // für Billing
}

export interface A2AResponse {
  status: "completed" | "failed" | "pending";
  response: string;
  metadata?: {
    model?: string;
    durationMs?: number;
    agentName?: string;
    conversationId?: string | null;
    suggestedFollowUps?: string[];
    confidence?: number;
    creditsConsumed?: number;
  };
}

/* ── Agent Card ── */

export function buildAgentCard(
  agentId: string,
  name: string,
  description: string,
  capabilities: string[],
  baseUrl: string,
  options?: { category?: string; creditCost?: number; rating?: number; usageCount?: number }
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
    category: options?.category || undefined,
    creditCost: options?.creditCost ?? 1,
    rating: options?.rating ?? 0,
    usageCount: options?.usageCount ?? 0,
  };
}

/* ── API Key Management ── */

export function generateA2AApiKey(): string {
  return `kiln_a2a_${crypto.randomBytes(24).toString("hex")}`;
}

export async function regenerateA2AKey(agentId: string): Promise<string> {
  const newKey = generateA2AApiKey();
  await prisma.agent.update({
    where: { id: agentId },
    data: { a2aApiKey: newKey },
  });
  return newKey;
}

export async function validateA2AKey(agentId: string, providedKey: string): Promise<boolean> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { a2aApiKey: true },
  });
  if (!agent?.a2aApiKey) return false;
  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(agent.a2aApiKey),
    Buffer.from(providedKey.padEnd(agent.a2aApiKey.length).slice(0, agent.a2aApiKey.length))
  );
}

/**
 * Ensures an agent has an A2A API key, generating one if missing.
 */
export async function ensureA2AKey(agentId: string): Promise<string> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { a2aApiKey: true },
  });
  if (agent?.a2aApiKey) return agent.a2aApiKey;
  return regenerateA2AKey(agentId);
}

/* ── Context Building ── */

export function buildContextPrompt(ctx: A2AContext): string {
  const parts: string[] = [];

  if (ctx.visitorInfo) {
    const vi = ctx.visitorInfo;
    if (vi.name) parts.push(`You're assisting a visitor named ${vi.name}.`);
    if (vi.previousTopics?.length) {
      parts.push(`They previously discussed: ${vi.previousTopics.join(", ")}.`);
    }
    if (vi.email) parts.push(`Their email is ${vi.email}.`);
  }

  if (ctx.sourceAgent) {
    parts.push(`This request comes from "${ctx.sourceAgent.name}" (${ctx.sourceAgent.platform}).`);
  }

  if (ctx.taskType) {
    const labels: Record<string, string> = {
      question: "answer a question",
      action: "perform an action",
      handoff: "take over a conversation",
    };
    parts.push(`Task type: ${labels[ctx.taskType] || ctx.taskType}.`);
  }

  if (ctx.priority === "urgent") {
    parts.push("PRIORITY: URGENT — respond as quickly and concisely as possible.");
  }

  return parts.length > 0 ? `\n\nCONTEXT FROM CALLING AGENT:\n${parts.join("\n")}` : "";
}

export function buildConversationMessages(ctx: A2AContext, task: string) {
  const messages: { role: "user" | "assistant"; content: string }[] = [];

  // Include conversation history (truncated to last 10)
  if (ctx.conversationHistory?.length) {
    const recent = ctx.conversationHistory.slice(-10);
    for (const msg of recent) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
      }
    }
  }

  // Ensure the task is the last user message
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== task) {
    messages.push({ role: "user", content: task });
  }

  return messages;
}

/* ── Discovery ── */

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

/* ── Outbound Messaging ── */

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

/* ── Capability Derivation ── */

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

/* ── A2A Categories ── */

export const A2A_CATEGORIES = [
  "Sales",
  "Support",
  "Booking",
  "Research",
  "Data Processing",
  "Marketing",
  "HR",
  "Legal",
  "Other",
] as const;

export type A2ACategory = typeof A2A_CATEGORIES[number];

/* ── Rate Limiting (simple in-memory) ── */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkA2ARateLimit(sourceKey: string, maxPerHour = 100): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(sourceKey);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(sourceKey, { count: 1, resetAt: now + 3600_000 });
    return true;
  }

  if (entry.count >= maxPerHour) return false;
  entry.count++;
  return true;
}

/**
 * Update agent usage stats after a successful A2A call.
 */
export async function updateAgentA2AStats(agentId: string, durationMs: number): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { a2aUsageCount: true, a2aAvgResponseMs: true },
  });
  if (!agent) return;

  const newCount = agent.a2aUsageCount + 1;
  const newAvg = Math.round(
    (agent.a2aAvgResponseMs * agent.a2aUsageCount + durationMs) / newCount
  );

  await prisma.agent.update({
    where: { id: agentId },
    data: { a2aUsageCount: newCount, a2aAvgResponseMs: newAvg },
  });
}
