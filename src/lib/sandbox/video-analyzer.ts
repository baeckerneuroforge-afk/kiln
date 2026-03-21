/**
 * Watch & Learn — Video Analysis Service
 * Analysiert Screen-Recordings und extrahiert Workflows als Procedural Memory.
 * Nutzt Vision-Modelle um Frame-für-Frame zu verstehen was der User tut.
 */

import { prisma } from "@/lib/prisma";
import type { ProcedureStep } from "./procedural-memory";

/* ── Types ── */

export interface ExtractedFrame {
  index: number;
  timestampMs: number;
  imageBase64: string;
}

export interface WorkflowStep {
  stepNumber: number;
  action: "navigate" | "click" | "type" | "scroll" | "extract_data" | "wait" | "select";
  target: string; // CSS-Selector-Hinweis oder Beschreibung
  url?: string;
  typedText?: string;
  dataExtracted?: string[];
  reasoning: string;
}

export interface VideoAnalysisResult {
  steps: WorkflowStep[];
  summary: string;
  domain: string;
  taskType: string;
}

const ANALYSIS_MODEL = "claude-sonnet-4-20250514";
const FRAMES_PER_BATCH = 4; // Vision-Modelle: max 4 Bilder pro Request sinnvoll

/* ── Frame Extraction ── */

/**
 * Extrahiert Key-Frames aus einem Video via Canvas API (browser-seitig)
 * oder via Server-seitiger Verarbeitung.
 * Für Server: Nutzt Supabase-gespeicherte Videos.
 */
export async function extractKeyFrames(
  videoUrl: string,
  intervalMs: number = 2000,
  maxFrames: number = 30,
): Promise<ExtractedFrame[]> {
  // Server-seitige Frame-Extraktion via fetch + ffmpeg-Alternativen
  // In Produktion: Video von Supabase laden, Frames via sharp oder canvas extrahieren
  // Für den MVP: Client sendet bereits extrahierte Frames
  const frames: ExtractedFrame[] = [];

  try {
    // Versuche Video-Metadaten zu laden
    const response = await fetch(videoUrl, { method: "HEAD" });
    if (!response.ok) {
      throw new Error(`Video nicht erreichbar: ${response.status}`);
    }

    // Für Server-seitige Extraktion: Video-Dauer schätzen und Frames berechnen
    const contentLength = parseInt(response.headers.get("content-length") || "0");
    const estimatedDurationMs = Math.min(contentLength / 500, 120000); // Grobe Schätzung, max 2 Min
    const frameCount = Math.min(maxFrames, Math.ceil(estimatedDurationMs / intervalMs));

    for (let i = 0; i < frameCount; i++) {
      frames.push({
        index: i,
        timestampMs: i * intervalMs,
        imageBase64: "", // Wird vom Client-Upload oder Frame-Extractor gefüllt
      });
    }
  } catch {
    // Fallback: Leere Frame-Liste — Client muss Frames liefern
  }

  return frames;
}

/* ── Frame Analysis ── */

/**
 * Analysiert eine Batch von Frames mit einem Vision-Modell.
 * Erkennt User-Aktionen zwischen aufeinanderfolgenden Frames.
 */
async function analyzeFrameBatch(
  frames: ExtractedFrame[],
  taskDescription: string,
  batchIndex: number,
  previousContext: string = "",
): Promise<WorkflowStep[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  // Bilder als Vision-Content aufbauen
  const imageContent = frames
    .filter((f) => f.imageBase64)
    .map((f) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/png" as const,
        data: f.imageBase64,
      },
    }));

  if (imageContent.length === 0) return [];

  const prompt = `Du analysierst ein Screen-Recording eines Users, der eine Aufgabe ausführt.

Aufgabe: ${taskDescription}

${previousContext ? `Bisheriger Kontext:\n${previousContext}\n` : ""}

Dies sind ${imageContent.length} aufeinanderfolgende Screenshots (Batch ${batchIndex + 1}).
Für jede Transition zwischen zwei Frames, beschreibe:
1. Was der User getan hat (geklickt, getippt, gescrollt, navigiert)
2. Auf welches Element (CSS-Selector-Hinweis oder Beschreibung)
3. Welche URL/Seite sichtbar ist
4. Ob Daten extrahiert/angesehen wurden

Antworte NUR als JSON-Array:
[
  {
    "stepNumber": 1,
    "action": "navigate" | "click" | "type" | "scroll" | "extract_data" | "wait" | "select",
    "target": "Button-Text oder Element-Beschreibung",
    "url": "https://...",
    "typedText": "eingegebener Text (nur bei type)",
    "dataExtracted": ["feld1", "feld2"] (nur bei extract_data),
    "reasoning": "Warum diese Aktion"
  }
]`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              ...imageContent,
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) return [];

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    return JSON.parse(jsonMatch[0]) as WorkflowStep[];
  } catch {
    return [];
  }
}

/* ── Full Video Analysis ── */

/**
 * Analysiert alle Frames und erstellt einen vollständigen Workflow.
 */
export async function analyzeFrames(
  frames: ExtractedFrame[],
  taskDescription: string,
  onProgress?: (analyzed: number, total: number) => void,
): Promise<VideoAnalysisResult> {
  const validFrames = frames.filter((f) => f.imageBase64);
  const allSteps: WorkflowStep[] = [];
  let context = "";

  // Frames in Batches analysieren
  for (let i = 0; i < validFrames.length; i += FRAMES_PER_BATCH) {
    const batch = validFrames.slice(i, i + FRAMES_PER_BATCH);
    const batchSteps = await analyzeFrameBatch(batch, taskDescription, Math.floor(i / FRAMES_PER_BATCH), context);

    // Steps mit korrekten Nummern versehen
    for (const step of batchSteps) {
      step.stepNumber = allSteps.length + 1;
      allSteps.push(step);
    }

    // Kontext für nächsten Batch aufbauen
    if (batchSteps.length > 0) {
      context = `Bisherige Schritte: ${batchSteps.map((s) => `${s.stepNumber}. ${s.action} auf "${s.target}"`).join(", ")}`;
    }

    onProgress?.(Math.min(i + FRAMES_PER_BATCH, validFrames.length), validFrames.length);
  }

  // Domain und TaskType aus den Steps ableiten
  const urls = allSteps.filter((s) => s.url).map((s) => s.url!);
  let domain = "unknown";
  if (urls.length > 0) {
    try {
      domain = new URL(urls[0]).hostname.replace(/^www\./, "");
    } catch {
      domain = "unknown";
    }
  }

  const taskType = classifyFromSteps(allSteps);

  return {
    steps: allSteps,
    summary: `${allSteps.length} Schritte erkannt auf ${domain}`,
    domain,
    taskType,
  };
}

/**
 * Klassifiziert den Task-Typ basierend auf den erkannten Schritten.
 */
function classifyFromSteps(steps: WorkflowStep[]): string {
  const hasExtraction = steps.some((s) => s.action === "extract_data");
  const hasTyping = steps.some((s) => s.action === "type");
  const hasNavigation = steps.filter((s) => s.action === "navigate").length > 2;

  if (hasExtraction) return "data_extraction";
  if (hasTyping && steps.filter((s) => s.action === "type").length > 2) return "form_fill";
  if (hasNavigation) return "monitoring";
  return "general";
}

/* ── Procedure Generation ── */

/**
 * Konvertiert analysierte Workflow-Steps in ProceduralMemory-kompatibles Format.
 */
export function generateProcedure(steps: WorkflowStep[]): ProcedureStep[] {
  return steps.map((s) => ({
    step: s.stepNumber,
    action: s.action,
    selector: s.target,
    target: s.url,
    fields: s.dataExtracted,
    notes: s.reasoning,
    waitMs: s.action === "wait" ? 2000 : undefined,
  }));
}

/* ── Session Management ── */

/**
 * Startet eine Watch & Learn Analyse-Session.
 */
export async function startWatchLearnSession(
  agentId: string,
  userId: string,
  videoUrl: string,
  taskDescription?: string,
): Promise<string> {
  const session = await prisma.watchLearnSession.create({
    data: {
      agentId,
      userId,
      videoUrl,
      taskDescription,
      status: "EXTRACTING",
    },
  });
  return session.id;
}

/**
 * Verarbeitet eine Watch & Learn Session komplett (async).
 * Wird nach dem Video-Upload aufgerufen.
 */
export async function processWatchLearnSession(
  sessionId: string,
  frames: ExtractedFrame[],
): Promise<void> {
  try {
    // Status: EXTRACTING
    await prisma.watchLearnSession.update({
      where: { id: sessionId },
      data: {
        status: "EXTRACTING",
        frameCount: frames.length,
      },
    });

    const session = await prisma.watchLearnSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return;

    // Status: ANALYZING
    await prisma.watchLearnSession.update({
      where: { id: sessionId },
      data: { status: "ANALYZING" },
    });

    const result = await analyzeFrames(
      frames,
      session.taskDescription || "Unbekannte Aufgabe",
      async (analyzed, total) => {
        await prisma.watchLearnSession.update({
          where: { id: sessionId },
          data: { framesAnalyzed: analyzed, frameCount: total },
        }).catch(() => {});
      },
    );

    // Status: GENERATING
    await prisma.watchLearnSession.update({
      where: { id: sessionId },
      data: {
        status: "GENERATING",
        extractedSteps: JSON.parse(JSON.stringify(result.steps)),
      },
    });

    const procedure = generateProcedure(result.steps);

    if (procedure.length < 2) {
      await prisma.watchLearnSession.update({
        where: { id: sessionId },
        data: {
          status: "FAILED",
          errorMessage: "Zu wenige Schritte erkannt. Bitte ein längeres oder deutlicheres Recording verwenden.",
        },
      });
      return;
    }

    // Procedural Memory speichern
    const procMemory = await prisma.proceduralMemory.create({
      data: {
        agentId: session.agentId,
        domain: result.domain,
        taskType: result.taskType,
        procedure: JSON.parse(JSON.stringify(procedure)),
        source: "watch_learn",
        confidence: 0.7, // Niedriger als auto_extracted (1.0)
        videoSessionId: sessionId,
        successRate: 0.7,
        timesUsed: 0,
        lastUsedAt: new Date(),
      },
    });

    // Status: COMPLETED
    await prisma.watchLearnSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        generatedProcedure: JSON.parse(JSON.stringify(procedure)),
        proceduralMemoryId: procMemory.id,
      },
    });
  } catch (err) {
    await prisma.watchLearnSession.update({
      where: { id: sessionId },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Unbekannter Fehler",
      },
    }).catch(() => {});
  }
}

/**
 * Bumpt die Confidence einer Watch & Learn Prozedur nach erfolgreichem automatischen Lauf.
 */
export async function bumpWatchLearnConfidence(proceduralMemoryId: string): Promise<void> {
  try {
    const proc = await prisma.proceduralMemory.findUnique({
      where: { id: proceduralMemoryId },
    });

    if (proc && proc.source === "watch_learn" && proc.confidence < 0.9) {
      await prisma.proceduralMemory.update({
        where: { id: proceduralMemoryId },
        data: {
          confidence: 0.9,
          successRate: Math.max(proc.successRate, 0.9),
        },
      });
    }
  } catch {
    // Non-critical
  }
}
