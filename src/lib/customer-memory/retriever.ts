import type { CustomerMemoryEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface MemoryRetrievalContext {
  departmentId?: string;
  currentMessage?: string;
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 10;

/**
 * Returns the most relevant active customer memory entries, ordered by
 * importance (DESC) then recency (DESC). Expired entries are excluded.
 */
export async function getRelevantMemory(
  customerProfileId: string,
  context: MemoryRetrievalContext = {},
): Promise<CustomerMemoryEntry[]> {
  const now = new Date();
  const max = context.maxEntries ?? DEFAULT_MAX_ENTRIES;

  return prisma.customerMemoryEntry.findMany({
    where: {
      customerProfileId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(max, 50)),
  });
}

/**
 * Format memory entries for inclusion in a manager-loop system prompt.
 * Output is a German-readable bullet list grouped by type.
 */
export function formatMemoryForPrompt(entries: CustomerMemoryEntry[]): string {
  if (entries.length === 0) return "";
  const grouped = new Map<string, CustomerMemoryEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.type) ?? [];
    list.push(entry);
    grouped.set(entry.type, list);
  }

  const labels: Record<string, string> = {
    INTERACTION: "Letzte Interaktionen",
    PREFERENCE: "Praeferenzen",
    FACT: "Fakten",
    EVENT: "Termine/Ereignisse",
  };

  const sections: string[] = [];
  for (const [type, list] of grouped.entries()) {
    const heading = labels[type] ?? type;
    const lines = list
      .slice(0, 8)
      .map((entry) => `- ${entry.content.replace(/\s+/g, " ").trim()}`)
      .join("\n");
    sections.push(`${heading}:\n${lines}`);
  }
  return `Was wir ueber diesen Kunden wissen:\n\n${sections.join("\n\n")}`;
}

export interface CustomerMemorySummary {
  profileId: string;
  promptBlock: string;
  totalEntries: number;
  preferences: Record<string, unknown> | null;
}

/**
 * Convenience for the manager-loop: returns the prompt block and metadata in
 * one shot.
 */
export async function buildMemorySummary(
  customerProfileId: string,
  context: MemoryRetrievalContext = {},
): Promise<CustomerMemorySummary | null> {
  const profile = await prisma.customerProfile.findUnique({
    where: { id: customerProfileId },
    select: {
      id: true,
      preferences: true,
      isAnonymized: true,
    },
  });
  if (!profile || profile.isAnonymized) return null;

  const entries = await getRelevantMemory(customerProfileId, context);
  return {
    profileId: profile.id,
    promptBlock: formatMemoryForPrompt(entries),
    totalEntries: entries.length,
    preferences: (profile.preferences as Record<string, unknown> | null) ?? null,
  };
}
