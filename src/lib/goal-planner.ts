/**
 * Goal-Based Execution Planner
 * Generiert Workflow-Pläne aus natürlichsprachlichen Zielen.
 * Der Agent plant die Schritte selbst, statt einem festen DAG zu folgen.
 */

import { callLlm } from "@/lib/llm";
import { z } from "zod";

/* ── Types ── */

export interface PlannedStep {
  id: string;
  type: "agent" | "action" | "research" | "decision" | "output";
  title: string;
  description: string;
  /** Welches Modell für diesen Schritt */
  suggestedModel?: string;
  /** Abhängigkeiten (Step-IDs die vorher abgeschlossen sein müssen) */
  dependsOn: string[];
  /** Geschätzte Dauer in Sekunden */
  estimatedDurationSec?: number;
  /** Konfiguration für den Schritt */
  config: Record<string, unknown>;
}

export interface ExecutionPlan {
  goal: string;
  steps: PlannedStep[];
  estimatedTotalSec: number;
  reasoning: string;
  createdAt: string;
  status: "draft" | "approved" | "executing" | "completed" | "failed";
}

export interface PlanModification {
  action: "add_step" | "remove_step" | "reorder" | "modify_step";
  stepId?: string;
  newStep?: PlannedStep;
  reason: string;
}

/* ── Plan Generation ── */

const PLAN_SYSTEM_PROMPT = `Du bist ein Workflow-Planer für die KILN AI Platform.
Deine Aufgabe: Zerlege ein Ziel in konkrete, ausführbare Schritte.

Jeder Schritt hat:
- id: Eindeutige ID (step_1, step_2, ...)
- type: "agent" (AI-Agent), "action" (HTTP/Email/Slack), "research" (Web-Suche), "decision" (Entscheidung), "output" (Ergebnis)
- title: Kurzer Titel
- description: Was genau getan werden soll
- suggestedModel: "haiku" für einfache, "sonnet" für mittlere, "opus" für komplexe Aufgaben
- dependsOn: Array von Step-IDs (Abhängigkeiten)
- estimatedDurationSec: Geschätzte Dauer
- config: Konfigurationsdetails

Regeln:
1. Maximal 10 Schritte pro Plan
2. Parallelisiere unabhängige Schritte (gleiche dependsOn)
3. Einfache Aufgaben = weniger Schritte
4. Immer einen finalen "output"-Schritt
5. Berücksichtige verfügbare Tools: HTTP-Requests, E-Mails, Slack, Variablen

Antworte AUSSCHLIESSLICH mit validem JSON im Format:
{
  "steps": [...],
  "estimatedTotalSec": number,
  "reasoning": "string"
}`;

/**
 * Generiert einen Execution-Plan aus einem natürlichsprachlichen Ziel.
 */
export async function planWorkflow(
  goal: string,
  availableAgents: { id: string; name: string; description: string }[] = [],
  contextHints?: Record<string, unknown>
): Promise<ExecutionPlan> {
  const agentList = availableAgents.length > 0
    ? `\n\nVerfügbare Agents:\n${availableAgents.map((a) => `- ${a.name}: ${a.description}`).join("\n")}`
    : "";

  const contextInfo = contextHints
    ? `\n\nVerfügbarer Kontext:\n${JSON.stringify(contextHints, null, 2)}`
    : "";

  const response = await callLlm({
    orgId: getPlannerOrgId(contextHints),
    userId: getPlannerUserId(contextHints),
    modelId: "claude-haiku-4-5-20251001",
    taskType: "structured_output",
    maxTokens: 2048,
    systemPrompt: PLAN_SYSTEM_PROMPT,
    outputSchema: planSchema,
    messages: [
      {
        role: "user",
        content: `Ziel: ${goal}${agentList}${contextInfo}\n\nErstelle einen konkreten Ausführungsplan.`,
      },
    ],
  });

  const parsed: { steps: PlannedStep[]; estimatedTotalSec: number; reasoning: string } =
    normalizePlanPayload(response.parsedOutput, response.content);

  // Validierung
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("Plan enthält keine Schritte");
  }
  if (parsed.steps.length > 10) {
    parsed.steps = parsed.steps.slice(0, 10);
  }

  // IDs sicherstellen
  parsed.steps = parsed.steps.map((step, i) => ({
    ...step,
    id: step.id || `step_${i + 1}`,
    dependsOn: step.dependsOn || [],
    config: step.config || {},
  }));

  return {
    goal,
    steps: parsed.steps,
    estimatedTotalSec: parsed.estimatedTotalSec || 60,
    reasoning: parsed.reasoning || "",
    createdAt: new Date().toISOString(),
    status: "draft",
  };
}

/* ── Plan Modification ── */

/**
 * Modifiziert einen bestehenden Plan basierend auf Zwischenergebnissen.
 */
export async function modifyPlan(
  currentPlan: ExecutionPlan,
  completedStepIds: string[],
  intermediateResults: Record<string, unknown>,
  modificationReason: string
): Promise<ExecutionPlan> {
  const response = await callLlm({
    orgId: "workflow-planner",
    modelId: "claude-haiku-4-5-20251001",
    taskType: "structured_output",
    maxTokens: 2048,
    systemPrompt: PLAN_SYSTEM_PROMPT,
    outputSchema: planSchema,
    messages: [
      {
        role: "user",
        content: `Bestehender Plan:\n${JSON.stringify(currentPlan.steps, null, 2)}\n\nAbgeschlossene Schritte: ${completedStepIds.join(", ")}\n\nZwischenergebnisse:\n${JSON.stringify(intermediateResults, null, 2)}\n\nÄnderungsgrund: ${modificationReason}\n\nPasse den Plan an. Behalte abgeschlossene Schritte bei, modifiziere oder füge nur zukünftige Schritte hinzu/an.`,
      },
    ],
  });

  let parsed: { steps: PlannedStep[]; estimatedTotalSec: number; reasoning: string };
  try {
    parsed = normalizePlanPayload(response.parsedOutput, response.content);
  } catch {
    // Bei Parse-Fehler den alten Plan beibehalten
    return currentPlan;
  }

  return {
    ...currentPlan,
    steps: parsed.steps.map((step, i) => ({
      ...step,
      id: step.id || `step_${i + 1}`,
      dependsOn: step.dependsOn || [],
      config: step.config || {},
    })),
    estimatedTotalSec: parsed.estimatedTotalSec || currentPlan.estimatedTotalSec,
    reasoning: parsed.reasoning || currentPlan.reasoning,
  };
}

/* ── Step Execution Mapping ── */

/**
 * Übersetzt einen geplanten Schritt in einen ausführbaren Workflow-Node-Typ.
 */
export function mapStepToNodeType(step: PlannedStep): string {
  switch (step.type) {
    case "agent":
      return "agent";
    case "action":
      // Erkennung aus Config
      if (step.config.url || step.config.endpoint) return "http_request";
      if (step.config.email || step.config.to) return "send_email";
      if (step.config.slack || step.config.webhookUrl) return "send_slack";
      return "http_request";
    case "research":
      return "ai_summarize"; // Web-Research via AI-Tool
    case "decision":
      return "if_condition";
    case "output":
      return "set_variable";
    default:
      return "agent";
  }
}

/**
 * Übersetzt suggestedModel zu einem echten Modell-Identifier.
 */
export function resolveModelHint(hint?: string): string {
  switch (hint) {
    case "haiku": return "claude-haiku-4-5-20251001";
    case "sonnet": return "claude-sonnet-4-6";
    case "opus": return "claude-opus-4-6";
    default: return "auto";
  }
}

const plannedStepSchema = z.object({
  id: z.string().optional().default(""),
  type: z.enum(["agent", "action", "research", "decision", "output"]),
  title: z.string(),
  description: z.string(),
  suggestedModel: z.string().optional(),
  dependsOn: z.array(z.string()).default([]),
  estimatedDurationSec: z.number().optional(),
  config: z.record(z.unknown()).default({}),
});

const planSchema = z.object({
  steps: z.array(plannedStepSchema).min(1),
  estimatedTotalSec: z.number().default(60),
  reasoning: z.string().default(""),
});

function normalizePlanPayload(
  parsedOutput: unknown,
  content: string,
): { steps: PlannedStep[]; estimatedTotalSec: number; reasoning: string } {
  if (isPlanPayload(parsedOutput)) return parsedOutput;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content) as unknown;
  if (!isPlanPayload(parsed)) {
    throw new Error("Plan-Antwort konnte nicht als JSON geparst werden");
  }
  return parsed;
}

function isPlanPayload(value: unknown): value is { steps: PlannedStep[]; estimatedTotalSec: number; reasoning: string } {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && Array.isArray((value as Record<string, unknown>).steps),
  );
}

function getPlannerOrgId(contextHints?: Record<string, unknown>): string {
  const orgId = contextHints?.orgId ?? contextHints?.organizationId ?? contextHints?.userId;
  return typeof orgId === "string" && orgId.trim() ? orgId : "workflow-planner";
}

function getPlannerUserId(contextHints?: Record<string, unknown>): string | undefined {
  const userId = contextHints?.userId;
  return typeof userId === "string" && userId.trim() ? userId : undefined;
}
