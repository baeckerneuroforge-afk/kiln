import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  customerMemoryEntry: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  customerProfile: {
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  customerProfileAudit: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  deactivateMemoryEntry,
  extractFactsFromConversation,
  recordInteraction,
  upsertPreference,
} from "@/lib/customer-memory/writer";

describe("customer-memory writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customerMemoryEntry.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `entry_${Math.random().toString(36).slice(2, 8)}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockPrisma.customerProfile.update.mockResolvedValue({});
    mockPrisma.customerProfile.findUnique.mockResolvedValue({ orgId: "org_a" });
  });

  it("recordInteraction creates entry and bumps totalConversations", async () => {
    await recordInteraction({
      customerProfileId: "cp_1",
      summary: "Wartungs-Anfrage Heizung",
      departmentId: "dept_a",
      sourceId: "msg_1",
      importance: 7,
    });
    expect(mockPrisma.customerMemoryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerProfileId: "cp_1",
          type: "INTERACTION",
          content: "Wartungs-Anfrage Heizung",
          importance: 7,
          source: "CONVERSATION",
        }),
      }),
    );
    expect(mockPrisma.customerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalConversations: { increment: 1 } }),
      }),
    );
  });

  it("recordInteraction clamps importance into 1-10", async () => {
    await recordInteraction({ customerProfileId: "cp_1", summary: "Test", importance: 999 });
    expect(mockPrisma.customerMemoryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ importance: 10 }) }),
    );
  });

  it("recordInteraction rejects empty summary", async () => {
    await expect(
      recordInteraction({ customerProfileId: "cp_1", summary: "  " }),
    ).rejects.toThrow();
  });

  it("recordInteraction with non-INTERACTION type does not bump conversation counter", async () => {
    await recordInteraction({ customerProfileId: "cp_1", summary: "Nur Fakt", type: "FACT" });
    expect(mockPrisma.customerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastSeenAt: expect.any(Date) } }),
    );
  });

  it("upsertPreference deactivates previous keys and creates new entry", async () => {
    await upsertPreference({ customerProfileId: "cp_1", key: "salutation", value: "Du" });
    expect(mockPrisma.customerMemoryEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: "PREFERENCE",
          content: { startsWith: "salutation=" },
          isActive: true,
        }),
        data: { isActive: false },
      }),
    );
    expect(mockPrisma.customerMemoryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "PREFERENCE",
          content: "salutation=Du",
        }),
      }),
    );
  });

  it("extractFactsFromConversation handles empty/whitespace input", async () => {
    expect(await extractFactsFromConversation({ customerProfileId: "cp_1", conversationText: "" })).toEqual([]);
    expect(await extractFactsFromConversation({ customerProfileId: "cp_1", conversationText: "   " })).toEqual([]);
  });

  it("extractFactsFromConversation pulls preferences and brand mentions", async () => {
    const facts = await extractFactsFromConversation({
      customerProfileId: "cp_1",
      conversationText: "Ich bevorzuge Termine vormittags. Meine Heizung ist eine Viessmann.",
    });
    expect(facts.length).toBeGreaterThan(0);
    expect(mockPrisma.customerMemoryEntry.create).toHaveBeenCalledTimes(facts.length);
  });

  it("extractFactsFromConversation skips when no triggers present", async () => {
    const facts = await extractFactsFromConversation({
      customerProfileId: "cp_1",
      conversationText: "Hallo, danke fuer die Antwort.",
    });
    expect(facts).toEqual([]);
  });

  it("deactivateMemoryEntry sets isActive=false and writes audit row", async () => {
    mockPrisma.customerMemoryEntry.update.mockResolvedValueOnce({});
    await deactivateMemoryEntry({ entryId: "entry_x", customerProfileId: "cp_1" });
    expect(mockPrisma.customerMemoryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry_x" },
      data: { isActive: false },
    });
    expect(mockPrisma.customerProfileAudit.create).toHaveBeenCalled();
  });
});
