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
    await onBatchDone(chunks, chunks.map(() => [0.7, 0.8, 0.9]), 0);
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
import { shkIndustryTemplate } from "@/lib/industries/shk";
import { shkDepartmentTemplates } from "@/lib/industries/shk/department-templates";
import { shkKnowledgeBaseSeeds } from "@/lib/industries/shk/knowledge-base-seeds";
import {
  calculateShkMaintenanceReminder,
  selectDueShkMaintenanceReminders,
} from "@/lib/industries/shk/maintenance-logic";
import {
  classifyShkEmergency,
  getCurrentShkSeason,
  shouldSendShkSeasonCampaign,
  shouldTriggerShkSeasonCampaign,
} from "@/lib/industries/shk/seasonal-logic";
import { shkVoiceScripts } from "@/lib/industries/shk/voice-scripts";
import { shkWhatsAppTemplates } from "@/lib/industries/shk/whatsapp-templates";
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

describe("shk industry pack", () => {
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

  it("defines four production SHK departments", () => {
    expect(shkDepartmentTemplates.map((department) => department.id)).toEqual([
      "shk-termin-anfragen",
      "shk-wartungsvertraege",
      "shk-kostenvoranschlag",
      "shk-foerderberatung",
    ]);
  });

  it("defines the requested worker counts", () => {
    expect(shkDepartmentTemplates.map((department) => department.workers.length)).toEqual([5, 3, 3, 3]);
  });

  it("uses a German appointment manager prompt with safety rules and gas-emergency hint", () => {
    const appointment = shkDepartmentTemplates[0];
    expect(appointment.managerSystemPrompt).toContain("Niemals festen Preis");
    expect(appointment.managerSystemPrompt).toContain("Gas-Geruch");
    expect(appointment.managerSystemPrompt).toContain("APPROVAL_FIRST");
  });

  it("configures Wartungsverträge as a daily 09:00 scheduled department", () => {
    const wartung = shkDepartmentTemplates.find((department) => department.id === "shk-wartungsvertraege");
    expect(wartung?.scheduleEnabled).toBe(true);
    expect(wartung?.scheduleCron).toBe("0 9 * * *");
  });

  it("marks BAFA/KfW-Förderberatung as info-only with energy-advisor referral", () => {
    const foerder = shkDepartmentTemplates.find((department) => department.id === "shk-foerderberatung");
    expect(foerder?.operatingMemory).toMatchObject({
      adviceMode: "non-binding-info-only",
      requiresEnergyAdvisorReferral: true,
    });
  });

  it("ships at least twenty-five SHK FAQ seeds across six categories", () => {
    expect(shkKnowledgeBaseSeeds.length).toBeGreaterThanOrEqual(25);
    expect(new Set(shkKnowledgeBaseSeeds.map((seed) => seed.category))).toEqual(new Set([
      "Notdienst",
      "Heizung",
      "Sanitär",
      "Klima/Lüftung",
      "Förderungen",
      "Allgemein",
    ]));
  });

  it("formats every SHK FAQ seed as Q and A content", () => {
    expect(shkKnowledgeBaseSeeds.every((seed) => seed.content.includes("Q:") && seed.content.includes("A:"))).toBe(true);
  });

  it("ships three parameterized SHK WhatsApp templates", () => {
    expect(shkWhatsAppTemplates.map((template) => template.name)).toEqual([
      "termin_bestaetigung_shk",
      "notdienst_eingegangen",
      "wartung_erinnerung",
    ]);
    expect(shkWhatsAppTemplates.every((template) => template.body.includes("{{1}}"))).toBe(true);
  });

  it("ships voice scripts with explicit gas-emergency safety wording", () => {
    expect(shkVoiceScripts).toHaveLength(3);
    const emergency = shkVoiceScripts.find((script) => script.id === "emergency-routing");
    expect(emergency?.script).toContain("0800 280 33 22");
    expect(emergency?.script).toContain("112");
  });

  it("detects current SHK season by month", () => {
    expect(getCurrentShkSeason(new Date("2026-08-15T00:00:00.000Z"))).toBe("PRE_HEATING");
    expect(getCurrentShkSeason(new Date("2026-12-15T00:00:00.000Z"))).toBe("HEATING");
    expect(getCurrentShkSeason(new Date("2026-04-15T00:00:00.000Z"))).toBe("POST_HEATING");
    expect(getCurrentShkSeason(new Date("2026-07-15T00:00:00.000Z"))).toBe("SUMMER");
  });

  it("triggers Wartungs-campaigns in pre-heating season (Aug/Sep)", () => {
    expect(shouldTriggerShkSeasonCampaign(new Date("2026-08-10T00:00:00.000Z"))).toBe(true);
    expect(shouldTriggerShkSeasonCampaign(new Date("2026-09-21T00:00:00.000Z"))).toBe(true);
    expect(shouldTriggerShkSeasonCampaign(new Date("2026-12-15T00:00:00.000Z"))).toBe(false);
  });

  it("locks SHK seasonal campaigns per customer season year", () => {
    expect(shouldSendShkSeasonCampaign({
      customerId: "cust_1",
      date: new Date("2026-08-10T00:00:00.000Z"),
      existingLocks: [{ customerId: "cust_1", season: "PRE_HEATING", year: 2026 }],
    })).toBe(false);
    expect(shouldSendShkSeasonCampaign({
      customerId: "cust_2",
      date: new Date("2026-08-10T00:00:00.000Z"),
      existingLocks: [{ customerId: "cust_1", season: "PRE_HEATING", year: 2026 }],
    })).toBe(true);
  });

  it("classifies Gas-Geruch as IMMEDIATE with hotline 0800 280 33 22", () => {
    const gas = classifyShkEmergency({ message: "Es riecht nach Gas in der Küche" });
    expect(gas.category).toBe("GAS");
    expect(gas.priority).toBe("IMMEDIATE");
    expect(gas.hotlineHint).toContain("0800 280 33 22");
    expect(gas.hotlineHint).toContain("112");
  });

  it("prioritizes Gas above Water above Heating", () => {
    const wasser = classifyShkEmergency({ message: "Wir haben einen Wasserrohrbruch im Keller" });
    const heizung = classifyShkEmergency({ message: "Die Heizung ist ausgefallen", isWinter: false });
    const heizungWinter = classifyShkEmergency({ message: "Heizungsausfall mitten im Winter", isWinter: true });
    expect(wasser.priority).toBe("IMMEDIATE");
    expect(heizung.priority).toBe("TODAY");
    expect(heizungWinter.priority).toBe("IMMEDIATE");
  });

  it("calculates six-week SHK maintenance reminders", () => {
    const result = calculateShkMaintenanceReminder({
      customerName: "Ada Beispiel",
      systemType: "Heizung",
      brand: "Viessmann",
      lastMaintenanceDate: "2025-06-20",
    }, new Date("2026-05-09T12:00:00.000Z"));
    expect(result.stage).toBe("SIX_WEEKS");
    expect(result.shouldSend).toBe(true);
  });

  it("skips SHK maintenance reminders when already done or stage was sent", () => {
    const done = calculateShkMaintenanceReminder({
      customerName: "Ben Beispiel",
      systemType: "Heizung",
      lastMaintenanceDate: "2025-05-23",
      maintenanceDone: true,
    }, new Date("2026-05-09T12:00:00.000Z"));
    const sent = calculateShkMaintenanceReminder({
      customerName: "Cem Beispiel",
      systemType: "Klima",
      lastMaintenanceDate: "2025-05-23",
      sentStages: ["TWO_WEEKS"],
    }, new Date("2026-05-09T12:00:00.000Z"));
    expect(done.shouldSend).toBe(false);
    expect(sent.shouldSend).toBe(false);
  });

  it("selects only due SHK maintenance reminder rows", () => {
    const reminders = selectDueShkMaintenanceReminders([
      { customerName: "Due", systemType: "Heizung", lastMaintenanceDate: "2025-06-20" },
      { customerName: "Done", systemType: "Heizung", lastMaintenanceDate: "2025-06-20", maintenanceDone: true },
      { customerName: "Later", systemType: "Klima", lastMaintenanceDate: "2025-08-01" },
    ], new Date("2026-05-09T12:00:00.000Z"));
    expect(reminders.map((row) => row.customerName)).toEqual(["Due"]);
  });

  it("exposes SHK metadata through seed rows for API access", () => {
    const row = toIndustryTemplateRow(shkIndustryTemplate);
    expect(row.metadata?.whatsappTemplates).toHaveLength(3);
    expect(row.metadata?.voiceScripts).toHaveLength(3);
    expect(row.metadata?.seasonLogic).toBeTruthy();
  });

  it("installer creates four SHK departments with fourteen workers and embeds all seeds", async () => {
    const result = await installIndustryPack({
      industry: "shk",
      userId: "user_1",
      orgId: "org_child",
      customerName: "SHK Test Betrieb",
    });
    expect(result.departmentsCreated).toBe(4);
    expect(result.workersCreated).toBe(14);
    expect(result.kbEntriesIndexed).toBe(shkIndustryTemplate.knowledgeBaseSeeds.length);
    expect(mockGenerateEmbeddingsBatched).toHaveBeenCalledTimes(shkIndustryTemplate.knowledgeBaseSeeds.length);
  });

  it("installer is idempotent for SHK and preserves customer customizations on refresh", async () => {
    mockPrisma.knowledgeBase.findMany.mockResolvedValueOnce(
      shkIndustryTemplate.knowledgeBaseSeeds.map((seed, index) => ({
        id: `kb_existing_${index}`,
        sourceName: seed.title,
        content: seed.content,
      })),
    );
    const tx = createTx();
    mockPrisma.$transaction.mockImplementationOnce(async (callback: (transaction: TxMock) => Promise<void>) => callback(tx));
    mockPrisma.department.findMany.mockResolvedValueOnce([
      { id: "dept_existing", name: "Termin-Anfragen + Notdienst", operatingMemory: { industryTemplateId: "shk-termin-anfragen", customNote: "keep" } },
    ]);
    const result = await installIndustryPack({
      industry: "shk",
      userId: "user_1",
      orgId: "org_child",
      customerName: "SHK Test Betrieb",
      selectedTemplateIds: ["shk-termin-anfragen"],
      refreshExisting: true,
    });
    expect(result.kbEntriesSkipped).toBe(shkIndustryTemplate.knowledgeBaseSeeds.length);
    expect(tx.department.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "dept_existing" },
      data: expect.objectContaining({
        operatingMemory: expect.objectContaining({ customNote: "keep" }),
      }),
    }));
  });
});
