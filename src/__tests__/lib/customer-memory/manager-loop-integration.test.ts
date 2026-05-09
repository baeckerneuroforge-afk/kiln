import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerProfile: { findUnique: vi.fn() },
    customerMemoryEntry: { findMany: vi.fn() },
  },
}));

import { buildMemorySummary, formatMemoryForPrompt } from "@/lib/customer-memory/retriever";
import type { CustomerMemoryContext } from "@/lib/departments/types";

describe("manager-loop customer-memory integration", () => {
  it("CustomerMemoryContext keys are usable in a manager prompt block", () => {
    const ctx: CustomerMemoryContext = {
      profileId: "cp_1",
      promptBlock: formatMemoryForPrompt([
        {
          id: "entry_a",
          customerProfileId: "cp_1",
          type: "INTERACTION",
          content: "Anfrage Heizungswartung Mai 2026",
          source: "CONVERSATION",
          sourceId: null,
          departmentId: null,
          workerId: null,
          importance: 6,
          embedding: null,
          isActive: true,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      totalEntries: 1,
      preferences: { language: "de" },
    };
    expect(ctx.promptBlock).toContain("Anfrage Heizungswartung");
    expect(ctx.preferences?.language).toBe("de");
  });

  it("buildMemorySummary returns null for unknown profile", async () => {
    const summary = await buildMemorySummary("missing_profile");
    expect(summary).toBeNull();
  });
});
