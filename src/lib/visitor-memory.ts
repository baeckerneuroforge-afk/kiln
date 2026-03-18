import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Types ──────────────────────────────────────────────────────────
export interface VisitorMemoryContext {
  name?: string;
  interests?: string[];
  questions?: string[];
  objections?: string[];
  buyingStage?: string;
  preferences?: string[];
  keyFacts?: string[];
}

// ── Core Functions ─────────────────────────────────────────────────

/**
 * Find or create a VisitorMemory record for a given visitor.
 */
export async function getOrCreateVisitor(agentId: string, visitorId: string) {
  const existing = await prisma.visitorMemory.findUnique({
    where: { agentId_visitorId: { agentId, visitorId } },
  });

  if (existing) {
    // Bump visit count + lastVisitAt
    return prisma.visitorMemory.update({
      where: { id: existing.id },
      data: {
        conversationCount: { increment: 1 },
        lastVisitAt: new Date(),
      },
    });
  }

  return prisma.visitorMemory.create({
    data: {
      agentId,
      visitorId,
      conversationCount: 1,
      memoryContext: {},
    },
  });
}

/**
 * Look up a visitor by email for cross-device recognition.
 * Falls back to visitorId if email not found.
 */
export async function findVisitorByEmail(agentId: string, email: string) {
  return prisma.visitorMemory.findFirst({
    where: { agentId, email: email.toLowerCase() },
  });
}

/**
 * Link an email to a visitor record (e.g., after COLLECT_EMAIL).
 * If another record with this email already exists, merge them.
 */
export async function linkEmailToVisitor(
  agentId: string,
  visitorId: string,
  email: string,
  name?: string | null
) {
  const lower = email.toLowerCase();

  // Check if another visitor already has this email
  const existingByEmail = await prisma.visitorMemory.findFirst({
    where: { agentId, email: lower, NOT: { visitorId } },
  });

  if (existingByEmail) {
    // Merge: update the email-owning record with the latest visitorId
    const currentVisitor = await prisma.visitorMemory.findUnique({
      where: { agentId_visitorId: { agentId, visitorId } },
    });

    if (currentVisitor) {
      const mergedContext = mergeContexts(
        existingByEmail.memoryContext as VisitorMemoryContext,
        currentVisitor.memoryContext as VisitorMemoryContext
      );
      const mergedTags = Array.from(new Set([...existingByEmail.tags, ...currentVisitor.tags]));

      await prisma.visitorMemory.update({
        where: { id: existingByEmail.id },
        data: {
          visitorId,
          displayName: name || currentVisitor.displayName || existingByEmail.displayName,
          memoryContext: mergedContext as unknown as Prisma.InputJsonValue,
          tags: mergedTags,
          conversationCount: existingByEmail.conversationCount + currentVisitor.conversationCount,
          lastVisitAt: new Date(),
        },
      });

      // Delete the old record
      await prisma.visitorMemory.delete({ where: { id: currentVisitor.id } }).catch(() => {});
      return;
    }
  }

  // Simple case: just update the current visitor
  await prisma.visitorMemory.upsert({
    where: { agentId_visitorId: { agentId, visitorId } },
    update: {
      email: lower,
      displayName: name || undefined,
    },
    create: {
      agentId,
      visitorId,
      email: lower,
      displayName: name || undefined,
      conversationCount: 1,
      memoryContext: {},
    },
  });
}

function mergeContexts(a: VisitorMemoryContext, b: VisitorMemoryContext): VisitorMemoryContext {
  return {
    name: b.name || a.name,
    interests: dedupe([...(a.interests || []), ...(b.interests || [])]),
    questions: dedupe([...(a.questions || []), ...(b.questions || [])]),
    objections: dedupe([...(a.objections || []), ...(b.objections || [])]),
    buyingStage: b.buyingStage || a.buyingStage,
    preferences: dedupe([...(a.preferences || []), ...(b.preferences || [])]),
    keyFacts: dedupe([...(a.keyFacts || []), ...(b.keyFacts || [])]),
  };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr)).slice(0, 20);
}

/**
 * After a conversation ends, call the LLM to extract key facts and merge with existing memory.
 * MUST be called in waitUntil() — never block the chat response.
 */
export async function updateVisitorMemory(
  agentId: string,
  visitorId: string,
  messages: { role: string; content: string }[],
  client: Anthropic,
  model: string
) {
  try {
    // Load existing memory
    const visitor = await prisma.visitorMemory.findUnique({
      where: { agentId_visitorId: { agentId, visitorId } },
    });

    const existingMemory = (visitor?.memoryContext as VisitorMemoryContext) || {};

    const transcript = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const response = await client.messages.create({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: `You extract and update a visitor profile from a conversation. You receive the existing profile and a new conversation transcript.

Return a JSON object with these fields (all optional):
- name: string — visitor's name if mentioned
- interests: string[] — topics, products, features they showed interest in
- questions: string[] — key questions they asked (summarized, max 5)
- objections: string[] — concerns or hesitations they expressed
- buyingStage: string — one of: "browsing", "evaluating", "ready-to-buy", "existing-customer", "unknown"
- preferences: string[] — communication preferences, language, etc.
- keyFacts: string[] — any other important facts (company, role, location, etc.)
- tags: string[] — short lowercase tags like "interested-in-pro", "asked-about-pricing", "returning-visitor"

Merge with the existing profile. Keep accumulated knowledge, add new details. Remove outdated info only if clearly contradicted.
Return ONLY the JSON object, no other text.`,
      messages: [
        {
          role: "user",
          content: `Existing visitor profile:\n${JSON.stringify(existingMemory, null, 2)}\n\nNew conversation:\n${transcript}`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]) as VisitorMemoryContext & { tags?: string[] };

    // Separate tags from context
    const newTags = parsed.tags || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (parsed as any).tags;

    const existingTags = visitor?.tags || [];
    const mergedTags = Array.from(new Set([...existingTags, ...newTags])).slice(0, 20);

    await prisma.visitorMemory.upsert({
      where: { agentId_visitorId: { agentId, visitorId } },
      update: {
        memoryContext: parsed as unknown as Prisma.InputJsonValue,
        tags: mergedTags,
        displayName: parsed.name || visitor?.displayName || undefined,
        lastVisitAt: new Date(),
      },
      create: {
        agentId,
        visitorId,
        memoryContext: parsed as unknown as Prisma.InputJsonValue,
        tags: mergedTags,
        displayName: parsed.name || undefined,
        conversationCount: 1,
      },
    });
  } catch (err) {
    console.error("[visitor-memory] Update failed:", err);
  }
}

/**
 * Generate a system prompt addition for a returning visitor.
 * Designed to produce natural, non-creepy greetings.
 */
export function generateMemoryPrefix(visitor: {
  displayName: string | null;
  email: string | null;
  memoryContext: unknown;
  conversationCount: number;
  lastVisitAt: Date;
  tags: string[];
}): string {
  const ctx = visitor.memoryContext as VisitorMemoryContext;
  const parts: string[] = [];

  parts.push("---");
  parts.push("RETURNING VISITOR CONTEXT:");
  parts.push(`This is a returning visitor (visit #${visitor.conversationCount}).`);

  if (visitor.displayName) {
    parts.push(`Their name is ${visitor.displayName}.`);
  }

  if (ctx.interests && ctx.interests.length > 0) {
    parts.push(`They previously showed interest in: ${ctx.interests.join(", ")}.`);
  }

  if (ctx.questions && ctx.questions.length > 0) {
    parts.push(`They previously asked about: ${ctx.questions.slice(0, 3).join("; ")}.`);
  }

  if (ctx.buyingStage && ctx.buyingStage !== "unknown") {
    parts.push(`Buying stage: ${ctx.buyingStage}.`);
  }

  if (ctx.objections && ctx.objections.length > 0) {
    parts.push(`Previous concerns: ${ctx.objections.join(", ")}.`);
  }

  if (ctx.keyFacts && ctx.keyFacts.length > 0) {
    parts.push(`Key facts: ${ctx.keyFacts.join(", ")}.`);
  }

  const daysSinceLastVisit = Math.floor(
    (Date.now() - new Date(visitor.lastVisitAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceLastVisit > 0) {
    parts.push(`Last visit: ${daysSinceLastVisit} day${daysSinceLastVisit !== 1 ? "s" : ""} ago.`);
  }

  parts.push("");
  parts.push("INSTRUCTIONS FOR RETURNING VISITORS:");
  parts.push("- Greet them warmly and personally. If you know their name, use it.");
  parts.push("- Briefly reference their previous interests or questions to show continuity.");
  parts.push("- Offer to pick up where they left off.");
  parts.push("- Keep it natural and conversational — do NOT list facts you know about them.");
  parts.push("- Do NOT mention visit counts, timestamps, or tracking in any way.");
  parts.push("- Example: \"Welcome back! Last time you were asking about our Pro plan — happy to pick up where we left off.\"");
  parts.push("---");

  return "\n\n" + parts.join("\n");
}
