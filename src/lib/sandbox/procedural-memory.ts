/**
 * Procedural Memory System
 * Agents lernen Workflows und können sie bei bekannten Domains wiederverwenden.
 * Reduziert LLM-Aufrufe und beschleunigt bekannte Abläufe.
 */

import { prisma } from "@/lib/prisma";

export interface ProcedureStep {
  step: number;
  action: string;
  selector?: string;
  target?: string;
  fields?: string[];
  waitMs?: number;
  notes?: string;
}

export type ProcedureSource = "manual" | "auto_extracted" | "watch_learn";

export interface StoredProcedure {
  id: string;
  agentId: string;
  domain: string;
  taskType: string;
  procedure: ProcedureStep[];
  source: ProcedureSource;
  confidence: number;
  videoSessionId?: string | null;
  successRate: number;
  timesUsed: number;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Extrahiert die Domain aus einer URL
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Bestimmt den Task-Typ aus einer Aufgabenbeschreibung
 */
function classifyTaskType(task: string): string {
  const lower = task.toLowerCase();

  if (lower.includes("preis") || lower.includes("price") || lower.includes("pricing")) {
    return "price_extraction";
  }
  if (lower.includes("login") || lower.includes("anmeld")) {
    return "login_flow";
  }
  if (lower.includes("form") || lower.includes("formular") || lower.includes("ausfüll")) {
    return "form_fill";
  }
  if (lower.includes("scrape") || lower.includes("extrah") || lower.includes("extract")) {
    return "data_extraction";
  }
  if (lower.includes("monitor") || lower.includes("überwach") || lower.includes("check")) {
    return "monitoring";
  }
  if (lower.includes("screenshot") || lower.includes("capture")) {
    return "screenshot";
  }
  if (lower.includes("download") || lower.includes("herunterla")) {
    return "download";
  }
  return "general";
}

/**
 * Sucht nach einer passenden Prozedur für einen Agent + Domain + Task
 */
export async function findProcedure(
  agentId: string,
  url: string,
  task: string,
): Promise<StoredProcedure | null> {
  const domain = extractDomain(url);
  const taskType = classifyTaskType(task);

  try {
    const record = await prisma.proceduralMemory.findFirst({
      where: {
        agentId,
        domain,
        taskType,
        successRate: { gte: 0.8 },
      },
      orderBy: { lastUsedAt: "desc" },
    });

    if (!record) return null;

    return {
      id: record.id,
      agentId: record.agentId,
      domain: record.domain,
      taskType: record.taskType,
      procedure: record.procedure as unknown as ProcedureStep[],
      source: (record.source || "auto_extracted") as ProcedureSource,
      confidence: record.confidence ?? 1.0,
      videoSessionId: record.videoSessionId,
      successRate: record.successRate,
      timesUsed: record.timesUsed,
      lastUsedAt: record.lastUsedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  } catch {
    // DB-Fehler ignorieren — graceful fallback
    return null;
  }
}

/**
 * Extrahiert eine Prozedur aus einer erfolgreichen Session
 */
export function extractProcedureFromSteps(
  steps: Array<{
    action: string;
    actionDetail: string;
    url: string;
    extractedData?: Record<string, unknown> | null;
  }>,
): ProcedureStep[] {
  return steps
    .filter((s) => s.action !== "analyze" && s.action !== "done")
    .map((s, i) => {
      const step: ProcedureStep = {
        step: i + 1,
        action: s.action,
        notes: s.actionDetail.split(" — ")[0] || undefined,
      };

      // Selector aus actionDetail extrahieren
      const selectorMatch = s.actionDetail.match(/["']([^"']+)["']/);
      if (selectorMatch && (s.action === "click" || s.action === "type" || s.action === "click_link")) {
        step.selector = selectorMatch[1];
      }

      // Target-URL bei Navigation
      if (s.action === "navigate" || s.action === "click_link") {
        step.target = s.url;
      }

      // Felder bei Extraktion
      if (s.action === "extract_data" && s.extractedData) {
        step.fields = Object.keys(s.extractedData);
      }

      return step;
    });
}

/**
 * Speichert oder aktualisiert eine Prozedur nach erfolgreicher Ausführung
 */
export async function saveProcedure(
  agentId: string,
  url: string,
  task: string,
  steps: Array<{
    action: string;
    actionDetail: string;
    url: string;
    extractedData?: Record<string, unknown> | null;
  }>,
  success: boolean,
): Promise<void> {
  const domain = extractDomain(url);
  const taskType = classifyTaskType(task);
  const procedure = extractProcedureFromSteps(steps);

  // Mindestens 2 Schritte für eine sinnvolle Prozedur
  if (procedure.length < 2) return;

  try {
    const existing = await prisma.proceduralMemory.findFirst({
      where: { agentId, domain, taskType },
    });

    if (existing) {
      // Vorhandene Prozedur aktualisieren
      const newTimesUsed = existing.timesUsed + 1;
      const newSuccessRate = success
        ? existing.successRate + (1 - existing.successRate) * 0.2 // Langsam erhöhen
        : existing.successRate * 0.8; // Bei Fehlschlag reduzieren

      await prisma.proceduralMemory.update({
        where: { id: existing.id },
        data: {
          procedure: JSON.parse(JSON.stringify(procedure)),
          successRate: Math.round(newSuccessRate * 100) / 100,
          timesUsed: newTimesUsed,
          lastUsedAt: new Date(),
        },
      });
    } else if (success) {
      // Neue Prozedur nur bei Erfolg anlegen
      await prisma.proceduralMemory.create({
        data: {
          agentId,
          domain,
          taskType,
          procedure: JSON.parse(JSON.stringify(procedure)),
          successRate: 1.0,
          timesUsed: 1,
          lastUsedAt: new Date(),
        },
      });
    }
  } catch {
    // DB-Fehler ignorieren — Procedural Memory ist optional
  }
}

/**
 * Konvertiert eine gespeicherte Prozedur in einen LLM-kompatiblen Plantext
 */
export function procedureToPromptHint(procedure: StoredProcedure): string {
  const steps = procedure.procedure
    .map((s) => {
      let desc = `${s.step}. ${s.action}`;
      if (s.selector) desc += ` auf "${s.selector}"`;
      if (s.target) desc += ` → ${s.target}`;
      if (s.fields) desc += ` (Felder: ${s.fields.join(", ")})`;
      if (s.notes) desc += ` — ${s.notes}`;
      return desc;
    })
    .join("\n");

  const sourceLabel = procedure.source === "watch_learn" ? "Watch & Learn" : procedure.source === "manual" ? "Manuell" : "Auto-erkannt";
  const confidenceLabel = procedure.confidence < 0.8 ? " (niedrige Konfidenz — prüfe jeden Schritt)" : "";

  return `\n\nBEKANNTE PROZEDUR für ${procedure.domain} (${sourceLabel}, Erfolgsrate: ${Math.round(procedure.successRate * 100)}%, ${procedure.timesUsed}× verwendet${confidenceLabel}):\n${steps}\n\nVersuche diese Schritte zuerst. Weiche nur ab wenn nötig.`;
}

/**
 * Listet alle Prozeduren eines Agents
 */
export async function listProcedures(agentId: string): Promise<StoredProcedure[]> {
  try {
    const records = await prisma.proceduralMemory.findMany({
      where: { agentId },
      orderBy: { lastUsedAt: "desc" },
      take: 50,
    });

    return records.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      domain: r.domain,
      taskType: r.taskType,
      procedure: r.procedure as unknown as ProcedureStep[],
      source: (r.source || "auto_extracted") as ProcedureSource,
      confidence: r.confidence ?? 1.0,
      videoSessionId: r.videoSessionId,
      successRate: r.successRate,
      timesUsed: r.timesUsed,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  } catch {
    return [];
  }
}

/**
 * Löscht eine Prozedur
 */
export async function deleteProcedure(id: string): Promise<void> {
  try {
    await prisma.proceduralMemory.delete({ where: { id } });
  } catch {
    // Ignorieren
  }
}
