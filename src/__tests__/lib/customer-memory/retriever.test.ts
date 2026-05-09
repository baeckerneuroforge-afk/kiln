import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  customerProfile: { findUnique: vi.fn() },
  customerMemoryEntry: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  buildMemorySummary,
  formatMemoryForPrompt,
  getRelevantMemory,
} from "@/lib/customer-memory/retriever";

const sampleEntry = (overrides: Partial<{ id: string; type: string; content: string; importance: number; isActive: boolean; createdAt: Date }>) => ({
  id: "entry_1",
  customerProfileId: "cp_1",
  type: "INTERACTION",
  content: "Hat heute angefragt",
  source: "CONVERSATION",
  sourceId: null,
  departmentId: null,
  workerId: null,
  importance: 5,
  embedding: null,
  isActive: true,
  expiresAt: null,
  createdAt: new Date("2026-05-01"),
  updatedAt: new Date("2026-05-01"),
  ...overrides,
});

describe("customer-memory retriever", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customerMemoryEntry.findMany.mockResolvedValue([]);
  });

  it("returns only active entries with respect to limit", async () => {
    mockPrisma.customerMemoryEntry.findMany.mockResolvedValueOnce([
      sampleEntry({ id: "a" }),
      sampleEntry({ id: "b" }),
    ]);
    const entries = await getRelevantMemory("cp_1", { maxEntries: 5 });
    expect(entries).toHaveLength(2);
    const call = mockPrisma.customerMemoryEntry.findMany.mock.calls[0]?.[0];
    expect(call?.where?.isActive).toBe(true);
    expect(call?.take).toBe(5);
  });

  it("filters out expired entries via OR clause", async () => {
    await getRelevantMemory("cp_1");
    const call = mockPrisma.customerMemoryEntry.findMany.mock.calls[0]?.[0];
    expect(call?.where?.OR).toEqual(
      expect.arrayContaining([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]),
    );
  });

  it("orders by importance DESC then recency DESC", async () => {
    await getRelevantMemory("cp_1");
    const call = mockPrisma.customerMemoryEntry.findMany.mock.calls[0]?.[0];
    expect(call?.orderBy).toEqual([{ importance: "desc" }, { createdAt: "desc" }]);
  });

  it("clamps maxEntries to a sane upper bound", async () => {
    await getRelevantMemory("cp_1", { maxEntries: 9999 });
    expect(mockPrisma.customerMemoryEntry.findMany.mock.calls[0]?.[0]?.take).toBe(50);
  });

  it("formatMemoryForPrompt groups entries by type with German labels", () => {
    const text = formatMemoryForPrompt([
      sampleEntry({ id: "a", type: "INTERACTION", content: "Anfrage Mai 2026" }),
      sampleEntry({ id: "b", type: "PREFERENCE", content: "salutation=Du" }),
      sampleEntry({ id: "c", type: "FACT", content: "Marke: Viessmann" }),
    ]);
    expect(text).toContain("Was wir ueber diesen Kunden wissen");
    expect(text).toContain("Letzte Interaktionen");
    expect(text).toContain("Praeferenzen");
    expect(text).toContain("Fakten");
    expect(text).toContain("Marke: Viessmann");
  });

  it("formatMemoryForPrompt returns empty string for no entries", () => {
    expect(formatMemoryForPrompt([])).toBe("");
  });

  it("buildMemorySummary returns null for anonymized profile", async () => {
    mockPrisma.customerProfile.findUnique.mockResolvedValueOnce({
      id: "cp_anon",
      preferences: null,
      isAnonymized: true,
    });
    const summary = await buildMemorySummary("cp_anon");
    expect(summary).toBeNull();
  });

  it("buildMemorySummary includes preferences when present", async () => {
    mockPrisma.customerProfile.findUnique.mockResolvedValueOnce({
      id: "cp_1",
      preferences: { language: "de", salutation: "Sie" },
      isAnonymized: false,
    });
    mockPrisma.customerMemoryEntry.findMany.mockResolvedValueOnce([
      sampleEntry({ content: "Letzter Termin Mai 2026" }),
    ]);
    const summary = await buildMemorySummary("cp_1", { departmentId: "dept_a" });
    expect(summary?.profileId).toBe("cp_1");
    expect(summary?.preferences).toEqual({ language: "de", salutation: "Sie" });
    expect(summary?.totalEntries).toBe(1);
    expect(summary?.promptBlock).toContain("Letzter Termin");
  });
});
