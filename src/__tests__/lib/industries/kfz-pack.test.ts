import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  industryTemplate: { findUnique: vi.fn() },
  knowledgeBase: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  department: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

const mockChunkText = vi.hoisted(() => vi.fn((text: string) => [text]));
const mockGenerateEmbeddingsBatched = vi.hoisted(() =>
  vi.fn(async (
    chunks: string[],
    onBatchDone: (batchChunks: string[], batchEmbeddings: number[][], batchStartIndex: number) => Promise<void>,
  ) => {
    await onBatchDone(chunks, chunks.map(() => [0.4, 0.5, 0.6]), 0);
    return chunks.length;
  }),
);
const mockStoreOrgChunks = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/rag", () => ({
  chunkText: mockChunkText,
  generateEmbeddingsBatched: mockGenerateEmbeddingsBatched,
  storeOrgChunks: mockStoreOrgChunks,
}));

import { installIndustryPack } from "@/lib/industries/shared/industry-installer";
import { kfzIndustryTemplate } from "@/lib/industries/kfz";
import { kfzDepartmentTemplates } from "@/lib/industries/kfz/department-templates";
import { kfzKnowledgeBaseSeeds } from "@/lib/industries/kfz/knowledge-base-seeds";
import { getCurrentSeason, shouldSendSeasonCampaign, shouldTriggerSeasonCampaign } from "@/lib/industries/kfz/season-logic";
import { calculateTuevReminder, selectDueTuevReminders } from "@/lib/industries/kfz/tuev-logic";
import { kfzVoiceScripts } from "@/lib/industries/kfz/voice-scripts";
import { kfzWhatsAppTemplates } from "@/lib/industries/kfz/whatsapp-templates";
import { toIndustryTemplateRow } from "@/lib/onboarding/industry-templates";

type TxMock = {
  department: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  departmentWorker: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  agent: { create: ReturnType<typeof vi.fn> };
};

function createTx(): TxMock {
  let departmentIndex = 0;
  let agentIndex = 0;
  return {
    department: {
      create: vi.fn(async () => {
        departmentIndex += 1;
        return { id: `dept_${departmentIndex}` };
      }),
      update: vi.fn(async () => ({})),
    },
    departmentWorker: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
    agent: {
      create: vi.fn(async () => {
        agentIndex += 1;
        return { id: `agent_${agentIndex}` };
      }),
    },
  };
}

describe("kfz industry pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let kbIndex = 0;
    mockPrisma.industryTemplate.findUnique.mockResolvedValue(null);
    mockPrisma.knowledgeBase.findMany.mockResolvedValue([]);
    mockPrisma.knowledgeBase.create.mockImplementation(async () => {
      kbIndex += 1;
      return { id: `kb_${kbIndex}` };
    });
    mockPrisma.knowledgeBase.update.mockResolvedValue({});
    mockPrisma.department.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: TxMock) => Promise<void>) => callback(createTx()));
  });

  it("defines four production KFZ departments", () => {
    expect(kfzDepartmentTemplates.map((department) => department.id)).toEqual([
      "kfz-termin-anfragen",
      "kfz-kostenvoranschlag",
      "kfz-tuev-hu-erinnerungen",
      "kfz-reifenwechsel-saison",
    ]);
  });

  it("defines the requested worker counts", () => {
    expect(kfzDepartmentTemplates.map((department) => department.workers.length)).toEqual([5, 3, 3, 3]);
  });

  it("uses a German appointment manager prompt with safety and pricing rules", () => {
    const appointment = kfzDepartmentTemplates[0];
    expect(appointment.managerSystemPrompt).toContain("Niemals festen Preis");
    expect(appointment.managerSystemPrompt).toContain("fahren Sie nicht mehr selbst");
    expect(appointment.managerSystemPrompt).toContain("APPROVAL_FIRST");
  });

  it("configures HU reminders as a daily 09:00 scheduled department", () => {
    const tuev = kfzDepartmentTemplates.find((department) => department.id === "kfz-tuev-hu-erinnerungen");
    expect(tuev?.scheduleEnabled).toBe(true);
    expect(tuev?.scheduleCron).toBe("0 9 * * *");
  });

  it("ships at least twenty-five KFZ FAQ seeds across six categories", () => {
    expect(kfzKnowledgeBaseSeeds.length).toBeGreaterThanOrEqual(25);
    expect(new Set(kfzKnowledgeBaseSeeds.map((seed) => seed.category))).toEqual(new Set([
      "Werkstatt-Info",
      "Inspektionen",
      "TÜV/HU",
      "Reparaturen",
      "Reifen",
      "Versicherung & Gutachten",
    ]));
  });

  it("ships three parameterized WhatsApp templates", () => {
    expect(kfzWhatsAppTemplates.map((template) => template.name)).toEqual([
      "termin_bestaetigung_kfz",
      "tuev_erinnerung",
      "reifen_saison_einladung",
    ]);
    expect(kfzWhatsAppTemplates.every((template) => template.body.includes("{{1}}"))).toBe(true);
  });

  it("ships voice scripts with ADAC/112 fallback safety", () => {
    expect(kfzVoiceScripts).toHaveLength(2);
    expect(kfzVoiceScripts.find((script) => script.id === "breakdown-assistance")?.script).toContain("112");
  });

  it("detects current tire season by month", () => {
    expect(getCurrentSeason(new Date("2026-04-01T00:00:00.000Z"))).toBe("SUMMER");
    expect(getCurrentSeason(new Date("2026-10-01T00:00:00.000Z"))).toBe("WINTER");
  });

  it("triggers tire campaigns only in early April or October", () => {
    expect(shouldTriggerSeasonCampaign(new Date("2026-04-15T00:00:00.000Z"))).toBe(true);
    expect(shouldTriggerSeasonCampaign(new Date("2026-10-01T00:00:00.000Z"))).toBe(true);
    expect(shouldTriggerSeasonCampaign(new Date("2026-10-16T00:00:00.000Z"))).toBe(false);
  });

  it("locks seasonal campaigns per customer season year", () => {
    expect(shouldSendSeasonCampaign({
      customerId: "cust_1",
      date: new Date("2026-10-01T00:00:00.000Z"),
      existingLocks: [{ customerId: "cust_1", season: "WINTER", year: 2026 }],
    })).toBe(false);
  });

  it("calculates six-week TÜV reminders", () => {
    const result = calculateTuevReminder({
      customerName: "Ada Beispiel",
      vehicleModel: "VW Golf",
      huDueDate: "2026-06-20",
    }, new Date("2026-05-09T12:00:00.000Z"));
    expect(result.stage).toBe("SIX_WEEKS");
    expect(result.shouldSend).toBe(true);
  });

  it("skips TÜV reminders when HU is already done or stage was sent", () => {
    const done = calculateTuevReminder({
      customerName: "Ben Beispiel",
      vehicleModel: "Audi A4",
      huDueDate: "2026-05-23",
      huDone: true,
    }, new Date("2026-05-09T12:00:00.000Z"));
    const sent = calculateTuevReminder({
      customerName: "Cem Beispiel",
      vehicleModel: "BMW 3er",
      huDueDate: "2026-05-23",
      sentStages: ["TWO_WEEKS"],
    }, new Date("2026-05-09T12:00:00.000Z"));
    expect(done.shouldSend).toBe(false);
    expect(sent.shouldSend).toBe(false);
  });

  it("selects only due TÜV reminder rows", () => {
    const reminders = selectDueTuevReminders([
      { customerName: "Due", vehicleModel: "VW Golf", huDueDate: "2026-05-23" },
      { customerName: "Done", vehicleModel: "Opel Corsa", huDueDate: "2026-05-23", huDone: true },
      { customerName: "Later", vehicleModel: "Skoda Octavia", huDueDate: "2026-07-01" },
    ], new Date("2026-05-09T12:00:00.000Z"));
    expect(reminders.map((row) => row.customerName)).toEqual(["Due"]);
  });

  it("exposes KFZ metadata through seed rows for API access", () => {
    const row = toIndustryTemplateRow(kfzIndustryTemplate);
    expect(row.metadata?.whatsappTemplates).toHaveLength(3);
    expect(row.metadata?.voiceScripts).toHaveLength(2);
    expect(row.metadata?.seasonLogic).toBeTruthy();
  });

  it("installer creates four departments and fourteen workers", async () => {
    const result = await installIndustryPack({
      industry: "kfz",
      userId: "user_1",
      orgId: "org_child",
      customerName: "Autohaus Test",
    });
    expect(result.departmentsCreated).toBe(4);
    expect(result.workersCreated).toBe(14);
    expect(result.departmentIds).toHaveLength(4);
  });

  it("installer embeds each KFZ seed into org knowledge", async () => {
    const result = await installIndustryPack({
      industry: "kfz",
      userId: "user_1",
      orgId: "org_child",
      customerName: "Autohaus Test",
    });
    expect(result.kbEntriesIndexed).toBe(kfzIndustryTemplate.knowledgeBaseSeeds.length);
    expect(mockGenerateEmbeddingsBatched).toHaveBeenCalledTimes(kfzIndustryTemplate.knowledgeBaseSeeds.length);
    expect(mockStoreOrgChunks).toHaveBeenCalled();
  });

  it("installer is idempotent for existing KFZ FAQs and departments", async () => {
    mockPrisma.knowledgeBase.findMany.mockResolvedValueOnce(
      kfzIndustryTemplate.knowledgeBaseSeeds.map((seed, index) => ({
        id: `kb_existing_${index}`,
        sourceName: seed.title,
        content: seed.content,
      })),
    );
    mockPrisma.department.findMany.mockResolvedValueOnce(
      kfzDepartmentTemplates.map((department, index) => ({
        id: `dept_existing_${index}`,
        name: department.name,
        operatingMemory: { industryTemplateId: department.id, customNote: "preserve" },
      })),
    );
    const result = await installIndustryPack({
      industry: "kfz",
      userId: "user_1",
      orgId: "org_child",
      customerName: "Autohaus Test",
    });
    expect(result.departmentsCreated).toBe(0);
    expect(result.departmentsReused).toBe(4);
    expect(result.kbEntriesSkipped).toBe(kfzIndustryTemplate.knowledgeBaseSeeds.length);
  });

  it("installer preserves customer customizations on pack refresh", async () => {
    const tx = createTx();
    mockPrisma.$transaction.mockImplementationOnce(async (callback: (transaction: TxMock) => Promise<void>) => callback(tx));
    mockPrisma.department.findMany.mockResolvedValueOnce([
      { id: "dept_existing", name: "Termin-Anfragen", operatingMemory: { industryTemplateId: "kfz-termin-anfragen", customNote: "keep" } },
    ]);
    await installIndustryPack({
      industry: "kfz",
      userId: "user_1",
      orgId: "org_child",
      customerName: "Autohaus Test",
      selectedTemplateIds: ["kfz-termin-anfragen"],
      refreshExisting: true,
    });
    expect(tx.department.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "dept_existing" },
      data: expect.objectContaining({
        operatingMemory: expect.objectContaining({ customNote: "keep" }),
      }),
    }));
  });
});
