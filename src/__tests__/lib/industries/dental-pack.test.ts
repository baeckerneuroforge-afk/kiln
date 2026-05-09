import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  industryTemplate: { findUnique: vi.fn() },
  knowledgeBase: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  department: { findMany: vi.fn() },
  departmentWorker: { findFirst: vi.fn() },
  agent: { create: vi.fn() },
  $transaction: vi.fn(),
}));

const mockChunkText = vi.hoisted(() => vi.fn((text: string) => [text]));
const mockGenerateEmbeddingsBatched = vi.hoisted(() =>
  vi.fn(async (
    chunks: string[],
    onBatchDone: (batchChunks: string[], batchEmbeddings: number[][], batchStartIndex: number) => Promise<void>,
  ) => {
    await onBatchDone(chunks, chunks.map(() => [0.1, 0.2, 0.3]), 0);
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
import { dentalIndustryTemplate } from "@/lib/industries/dental";
import { dentalDepartmentTemplates } from "@/lib/industries/dental/department-templates";
import { dentalKnowledgeBaseSeeds } from "@/lib/industries/dental/knowledge-base-seeds";
import { evaluateRecallDue, selectDueRecallRows } from "@/lib/industries/dental/recall-logic";
import { dentalVoiceScripts } from "@/lib/industries/dental/voice-scripts";
import { dentalWhatsAppTemplates } from "@/lib/industries/dental/whatsapp-templates";
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

describe("dental industry pack", () => {
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
    mockPrisma.departmentWorker.findFirst.mockResolvedValue(null);
    mockPrisma.agent.create.mockResolvedValue({ id: "agent_root" });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: TxMock) => Promise<void>) => callback(createTx()));
  });

  it("defines four production dental departments", () => {
    expect(dentalDepartmentTemplates.map((department) => department.id)).toEqual([
      "dental-termin-anfrage",
      "dental-recall-erinnerungen",
      "dental-zahnzusatzversicherung",
      "dental-notfall-triage",
    ]);
  });

  it("defines the requested worker counts", () => {
    expect(dentalDepartmentTemplates.map((department) => department.workers.length)).toEqual([5, 3, 3, 3]);
  });

  it("uses a German appointment manager prompt with emergency escalation", () => {
    const appointment = dentalDepartmentTemplates[0];
    expect(appointment.managerSystemPrompt).toContain("Bei NOTFALL");
    expect(appointment.managerSystemPrompt).toContain("APPROVAL_FIRST aktiv");
    expect(appointment.managerSystemPrompt).toContain("deutsche Anrede mit Sie");
  });

  it("configures recall as a daily 09:00 scheduled department", () => {
    const recall = dentalDepartmentTemplates.find((department) => department.id === "dental-recall-erinnerungen");
    expect(recall?.scheduleEnabled).toBe(true);
    expect(recall?.scheduleCron).toBe("0 9 * * *");
  });

  it("marks emergency triage as 24/7 and config-incomplete for voice", () => {
    const emergency = dentalDepartmentTemplates.find((department) => department.id === "dental-notfall-triage");
    expect(emergency?.premium).toBe(true);
    expect(emergency?.operatingMemory).toMatchObject({ activeHours: "24/7", voiceConfigStatus: "config-incomplete" });
  });

  it("ships at least thirty dental FAQ seeds", () => {
    expect(dentalKnowledgeBaseSeeds.length).toBeGreaterThanOrEqual(30);
  });

  it("covers all required FAQ categories", () => {
    expect(new Set(dentalKnowledgeBaseSeeds.map((seed) => seed.category))).toEqual(new Set([
      "Praxis-Info",
      "Termin-Buchung",
      "Versicherungen",
      "Behandlungen",
      "Kosten",
      "Notfaelle",
      "Kinder",
    ]));
  });

  it("formats every FAQ seed as Q and A content", () => {
    expect(dentalKnowledgeBaseSeeds.every((seed) => seed.content.includes("Q:") && seed.content.includes("A:"))).toBe(true);
  });

  it("ships three Meta-ready WhatsApp templates", () => {
    expect(dentalWhatsAppTemplates.map((template) => template.name)).toEqual([
      "termin_bestaetigung",
      "termin_erinnerung",
      "recall_erinnerung",
    ]);
  });

  it("keeps WhatsApp templates parameterized", () => {
    expect(dentalWhatsAppTemplates.every((template) => template.body.includes("{{1}}") && template.variables.length > 0)).toBe(true);
  });

  it("ships voice scripts with explicit emergency routing", () => {
    expect(dentalVoiceScripts).toHaveLength(3);
    expect(dentalVoiceScripts.find((script) => script.id === "emergency-routing")?.script).toContain("112");
  });

  it("evaluates six-month recall rows as due", () => {
    const result = evaluateRecallDue({
      patientName: "Ada Beispiel",
      lastTreatment: "Kontrolle",
      lastVisitDate: "2025-11-09",
      recallMonths: 6,
    }, new Date("2026-05-09T12:00:00.000Z"));
    expect(result.status).toBe("due");
    expect(result.dueDate).toBe("2026-05-09");
  });

  it("evaluates recall rows within fourteen days as soon", () => {
    const result = evaluateRecallDue({
      patientName: "Ben Beispiel",
      lastTreatment: "PZR",
      lastVisitDate: "2025-11-20",
      recallMonths: 6,
    }, new Date("2026-05-09T12:00:00.000Z"));
    expect(result.status).toBe("soon");
  });

  it("evaluates future recall rows as not due", () => {
    const result = evaluateRecallDue({
      patientName: "Cem Beispiel",
      lastTreatment: "Kontrolle",
      lastVisitDate: "2026-04-01",
      recallMonths: 6,
    }, new Date("2026-05-09T12:00:00.000Z"));
    expect(result.status).toBe("not_due");
  });

  it("selects only due and soon recall rows", () => {
    const rows = selectDueRecallRows([
      { patientName: "Due", lastTreatment: "Kontrolle", lastVisitDate: "2025-11-09", recallMonths: 6 },
      { patientName: "Soon", lastTreatment: "PZR", lastVisitDate: "2025-11-20", recallMonths: 6 },
      { patientName: "Later", lastTreatment: "Kontrolle", lastVisitDate: "2026-04-01", recallMonths: 6 },
    ], new Date("2026-05-09T12:00:00.000Z"));
    expect(rows.map((row) => row.patientName)).toEqual(["Due", "Soon"]);
  });

  it("exposes dental metadata on the industry template", () => {
    expect(dentalIndustryTemplate.metadata).toMatchObject({
      packVersion: "1.2",
      setupTimeMinutes: 30,
      estimatedManualSetupHours: 8,
    });
  });

  it("serializes metadata into seed rows for API access", () => {
    const row = toIndustryTemplateRow(dentalIndustryTemplate);
    expect(row.metadata?.whatsappTemplates).toHaveLength(3);
    expect(row.metadata?.voiceScripts).toHaveLength(3);
  });

  it("installer creates four departments and fourteen workers", async () => {
    const result = await installIndustryPack({
      industry: "dental",
      userId: "user_1",
      orgId: "org_child",
      customerName: "Praxis Test",
    });
    expect(result.departmentsCreated).toBe(4);
    expect(result.workersCreated).toBe(14);
    expect(result.departmentIds).toHaveLength(4);
  });

  it("installer embeds each dental seed into org knowledge", async () => {
    const result = await installIndustryPack({
      industry: "dental",
      userId: "user_1",
      orgId: "org_child",
      customerName: "Praxis Test",
    });
    expect(result.kbEntriesIndexed).toBe(dentalIndustryTemplate.knowledgeBaseSeeds.length);
    expect(mockGenerateEmbeddingsBatched).toHaveBeenCalledTimes(dentalIndustryTemplate.knowledgeBaseSeeds.length);
    expect(mockStoreOrgChunks).toHaveBeenCalled();
  });

  it("installer is idempotent for existing FAQs and departments", async () => {
    mockPrisma.knowledgeBase.findMany.mockResolvedValueOnce(
      dentalIndustryTemplate.knowledgeBaseSeeds.map((seed, index) => ({
        id: `kb_existing_${index}`,
        sourceName: seed.title,
        content: seed.content,
      })),
    );
    mockPrisma.department.findMany.mockResolvedValueOnce(
      dentalDepartmentTemplates.map((department, index) => ({
        id: `dept_existing_${index}`,
        name: department.name,
        operatingMemory: { industryTemplateId: department.id, customNote: "preserve me" },
      })),
    );
    const result = await installIndustryPack({
      industry: "dental",
      userId: "user_1",
      orgId: "org_child",
      customerName: "Praxis Test",
    });
    expect(result.departmentsCreated).toBe(0);
    expect(result.departmentsReused).toBe(4);
    expect(result.kbEntriesSkipped).toBe(dentalIndustryTemplate.knowledgeBaseSeeds.length);
  });

  it("installer preserves department customizations during refresh", async () => {
    const tx = createTx();
    mockPrisma.$transaction.mockImplementationOnce(async (callback: (transaction: TxMock) => Promise<void>) => callback(tx));
    mockPrisma.department.findMany.mockResolvedValueOnce([
      { id: "dept_existing", name: "Termin-Anfrage", operatingMemory: { industryTemplateId: "dental-termin-anfrage", customNote: "keep" } },
    ]);
    await installIndustryPack({
      industry: "dental",
      userId: "user_1",
      orgId: "org_child",
      customerName: "Praxis Test",
      selectedTemplateIds: ["dental-termin-anfrage"],
      refreshExisting: true,
    });
    expect(tx.department.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "dept_existing" },
      data: expect.objectContaining({
        operatingMemory: expect.objectContaining({ customNote: "keep" }),
      }),
    }));
  });

  it("installer respects selected template subsets", async () => {
    const result = await installIndustryPack({
      industry: "dental",
      userId: "user_1",
      orgId: "org_child",
      customerName: "Praxis Test",
      selectedTemplateIds: ["dental-termin-anfrage"],
    });
    expect(result.departmentsCreated).toBe(1);
    expect(result.workersCreated).toBe(5);
  });
});
