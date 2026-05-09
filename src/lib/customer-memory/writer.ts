import type { CustomerMemoryEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CustomerMemoryType = "INTERACTION" | "PREFERENCE" | "FACT" | "EVENT";
export type CustomerMemorySource = "CONVERSATION" | "MANUAL" | "IMPORTED";

export interface RecordInteractionArgs {
  customerProfileId: string;
  summary: string;
  type?: CustomerMemoryType;
  source?: CustomerMemorySource;
  sourceId?: string | null;
  departmentId?: string | null;
  workerId?: string | null;
  importance?: number;
  expiresAt?: Date | null;
}

function clampImportance(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 5;
  return Math.max(1, Math.min(10, Math.trunc(value)));
}

/**
 * Records a memory entry tied to a customer profile and bumps the profile's
 * conversation counters. Safe to call from manager-loop / channel webhooks.
 */
export async function recordInteraction(args: RecordInteractionArgs): Promise<CustomerMemoryEntry> {
  const summary = args.summary?.trim();
  if (!summary) throw new Error("Cannot record empty memory entry");

  const importance = clampImportance(args.importance);
  const type = args.type ?? "INTERACTION";
  const source = args.source ?? "CONVERSATION";

  const entry = await prisma.customerMemoryEntry.create({
    data: {
      customerProfileId: args.customerProfileId,
      type,
      content: summary.slice(0, 8_000),
      source,
      sourceId: args.sourceId ?? null,
      departmentId: args.departmentId ?? null,
      workerId: args.workerId ?? null,
      importance,
      expiresAt: args.expiresAt ?? null,
    },
  });

  if (type === "INTERACTION") {
    await prisma.customerProfile.update({
      where: { id: args.customerProfileId },
      data: {
        totalConversations: { increment: 1 },
        lastSeenAt: new Date(),
      },
    });
  } else {
    await prisma.customerProfile.update({
      where: { id: args.customerProfileId },
      data: { lastSeenAt: new Date() },
    });
  }

  return entry;
}

export interface UpsertPreferenceArgs {
  customerProfileId: string;
  key: string;
  value: string;
  importance?: number;
}

/**
 * Stores or updates a customer preference (language, salutation, channel, etc).
 * One row per (customerProfileId, key); duplicates are deactivated.
 */
export async function upsertPreference(args: UpsertPreferenceArgs): Promise<CustomerMemoryEntry> {
  const content = `${args.key}=${args.value}`;
  await prisma.customerMemoryEntry.updateMany({
    where: {
      customerProfileId: args.customerProfileId,
      type: "PREFERENCE",
      content: { startsWith: `${args.key}=` },
      isActive: true,
    },
    data: { isActive: false },
  });

  return prisma.customerMemoryEntry.create({
    data: {
      customerProfileId: args.customerProfileId,
      type: "PREFERENCE",
      content,
      source: "MANUAL",
      importance: clampImportance(args.importance ?? 6),
    },
  });
}

export interface ExtractFactsArgs {
  customerProfileId: string;
  conversationText: string;
  departmentId?: string | null;
  sourceId?: string | null;
}

/**
 * Heuristic fact extraction from conversation text. Pulls dates, mentioned
 * brands and explicit "ich bevorzuge"/"meine X ist" lines into FACT entries.
 * Synchronous and cheap — does NOT call an LLM. The optional LLM-based
 * extractor is left for a future sprint.
 */
export async function extractFactsFromConversation(args: ExtractFactsArgs): Promise<CustomerMemoryEntry[]> {
  const text = args.conversationText?.trim();
  if (!text) return [];
  const facts: { content: string; importance: number }[] = [];

  const preferenceMatch = text.match(/ich bevorzuge ([^.\n]{3,120})/i);
  if (preferenceMatch) {
    facts.push({ content: `Bevorzugt: ${preferenceMatch[1].trim()}`, importance: 7 });
  }

  const dateMatch = text.match(/(?:termin|am)\s+(\d{1,2}\.\d{1,2}\.(?:\d{2,4})?)/i);
  if (dateMatch) {
    facts.push({ content: `Termin erwaehnt: ${dateMatch[1]}`, importance: 6 });
  }

  const brandMatch = text.match(/\b(Viessmann|Vaillant|Buderus|Bosch|Wolf|Junkers|Daikin|Mitsubishi)\b/i);
  if (brandMatch) {
    facts.push({ content: `Marke erwaehnt: ${brandMatch[1]}`, importance: 5 });
  }

  if (facts.length === 0) return [];

  const created: CustomerMemoryEntry[] = [];
  for (const fact of facts) {
    const entry = await prisma.customerMemoryEntry.create({
      data: {
        customerProfileId: args.customerProfileId,
        type: "FACT",
        content: fact.content,
        source: "CONVERSATION",
        sourceId: args.sourceId ?? null,
        departmentId: args.departmentId ?? null,
        importance: fact.importance,
      },
    });
    created.push(entry);
  }
  return created;
}

export interface DeactivateMemoryArgs {
  entryId: string;
  customerProfileId: string;
  actorUserId?: string | null;
}

export async function deactivateMemoryEntry(args: DeactivateMemoryArgs): Promise<void> {
  await prisma.customerMemoryEntry.update({
    where: { id: args.entryId },
    data: { isActive: false },
  });
  await prisma.customerProfileAudit.create({
    data: {
      customerProfileId: args.customerProfileId,
      orgId: (await prisma.customerProfile.findUnique({
        where: { id: args.customerProfileId },
        select: { orgId: true },
      }))?.orgId ?? "",
      actorUserId: args.actorUserId ?? null,
      action: "MEMORY_DELETE",
      details: { entryId: args.entryId },
    },
  });
}
