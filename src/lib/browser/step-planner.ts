/**
 * Pattern 1: Intelligent Step Planning
 * Plant 3-5 Schritte voraus basierend auf Task und Seitenkontext.
 * Bestimmt wann Screenshots nötig sind (nur an Checkpoints).
 * Reduziert Vision-API-Aufrufe durch vorausschauende Planung.
 */

import type { PageStructure } from "./page-cache";

/* ── Types ── */

export interface PlannedStep {
  action: "navigate" | "click" | "type" | "scroll" | "extract" | "wait";
  target?: string;
  value?: string;
  url?: string;
  /** Ob nach diesem Schritt ein Screenshot nötig ist */
  needsScreenshot: boolean;
  /** Ob nach diesem Schritt eine Verifikation nötig ist */
  needsVerification: boolean;
  /** Erwartetes Ergebnis für Verifikation */
  expectedOutcome?: string;
  /** Geschätzte Vision-API-Kosten (0 = kein LLM-Call) */
  estimatedCreditCost: number;
  reasoning: string;
}

export interface StepPlan {
  steps: PlannedStep[];
  /** Gesamte geschätzte Kosten für diesen Plan */
  totalEstimatedCredits: number;
  /** Checkpoint-Indizes (wo Screenshots erzwungen werden) */
  checkpointIndices: number[];
  /** Ob der Plan eine Neuplanung bei Fehlschlag vorsieht */
  hasReplannningFallback: boolean;
  confidence: number; // 0-1
}

export type TaskType =
  | "data_extraction"
  | "form_fill"
  | "navigation"
  | "comparison"
  | "monitoring"
  | "search"
  | "unknown";

/* ── Constants ── */

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_PLAN_STEPS = 8;
const VISION_CREDIT_COST = 3; // Geschätzte Credits pro Vision-Call
const HAIKU_CREDIT_COST = 0.5; // Geschätzte Credits pro Haiku-Call

/* ── Task Type Detection (kein LLM nötig) ── */

const TASK_PATTERNS: Array<{ type: TaskType; patterns: RegExp[] }> = [
  {
    type: "data_extraction",
    patterns: [
      /extract|scrape|get (?:the )?(?:price|data|info|details|content)/i,
      /(?:what|how much|find) .{0,40}(?:price|cost|rating|review)/i,
      /compare .{0,40}(?:prices?|features?|specs?)/i,
    ],
  },
  {
    type: "form_fill",
    patterns: [
      /fill|submit|enter|sign ?up|register|book|apply|order/i,
      /(?:type|input|set) .{0,30}(?:form|field|name|email|address)/i,
    ],
  },
  {
    type: "navigation",
    patterns: [
      /go to|open|visit|navigate|check .{0,20}(?:page|site|section)/i,
      /find .{0,30}(?:page|section|button|link)/i,
    ],
  },
  {
    type: "comparison",
    patterns: [
      /compare|versus|vs\.?|difference|better|cheaper/i,
      /(?:which|what) .{0,30}(?:best|cheapest|fastest|better)/i,
    ],
  },
  {
    type: "monitoring",
    patterns: [
      /monitor|watch|check if|alert|notify|track/i,
      /(?:is|are|has) .{0,30}(?:available|in stock|changed|updated)/i,
    ],
  },
  {
    type: "search",
    patterns: [
      /search|look for|find .{0,40}(?:on|at|in)/i,
      /(?:where|how) .{0,30}(?:buy|get|find|download)/i,
    ],
  },
];

/* ── Step Planner ── */

export class StepPlanner {
  private planHistory: StepPlan[] = [];

  /**
   * Erkennt den Task-Typ ohne LLM-Call (regelbasiert).
   */
  detectTaskType(task: string): TaskType {
    for (const { type, patterns } of TASK_PATTERNS) {
      if (patterns.some((p) => p.test(task))) return type;
    }
    return "unknown";
  }

  /**
   * Erstellt einen Plan basierend auf Task, Seitenstruktur und bekannten Patterns.
   * KEIN LLM-Call — rein heuristisch. Schnell und kostenlos.
   */
  createQuickPlan(
    task: string,
    currentUrl: string,
    pageStructure: PageStructure | null,
    taskType?: TaskType,
  ): StepPlan {
    const type = taskType || this.detectTaskType(task);
    const steps: PlannedStep[] = [];

    switch (type) {
      case "data_extraction":
        steps.push(...this.planDataExtraction(task, currentUrl, pageStructure));
        break;
      case "form_fill":
        steps.push(...this.planFormFill(task, pageStructure));
        break;
      case "comparison":
        steps.push(...this.planComparison(task, currentUrl));
        break;
      case "search":
        steps.push(...this.planSearch(task, pageStructure));
        break;
      case "navigation":
        steps.push(...this.planNavigation(task));
        break;
      case "monitoring":
        steps.push(...this.planMonitoring(task, currentUrl));
        break;
      default:
        // Fallback: Vision-basierte Planung (Screenshot + LLM)
        steps.push({
          action: "navigate",
          url: currentUrl,
          needsScreenshot: true,
          needsVerification: false,
          estimatedCreditCost: VISION_CREDIT_COST,
          reasoning: "Unbekannter Task-Typ — Screenshot für Orientierung",
        });
    }

    // Checkpoints: letzter Step + jeder Step der einen Screenshot braucht
    const checkpointIndices = steps
      .map((s, i) => (s.needsScreenshot ? i : -1))
      .filter((i) => i >= 0);

    // Immer letzten Step als Checkpoint
    if (steps.length > 0 && !checkpointIndices.includes(steps.length - 1)) {
      checkpointIndices.push(steps.length - 1);
    }

    const plan: StepPlan = {
      steps: steps.slice(0, MAX_PLAN_STEPS),
      totalEstimatedCredits: steps.reduce((sum, s) => sum + s.estimatedCreditCost, 0),
      checkpointIndices,
      hasReplannningFallback: true,
      confidence: type === "unknown" ? 0.3 : 0.7,
    };

    this.planHistory.push(plan);
    return plan;
  }

  /**
   * Erstellt einen detaillierteren Plan mit Haiku.
   * Kostet ~0.5 Credits, aber liefert bessere Pläne für komplexe Tasks.
   */
  async createDetailedPlan(
    task: string,
    currentUrl: string,
    htmlSummary: string,
    pageStructure: PageStructure | null,
  ): Promise<StepPlan> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return this.createQuickPlan(task, currentUrl, pageStructure);

    const structureHint = pageStructure
      ? `\nBekannte Seitenelemente:\n${JSON.stringify(pageStructure, null, 2).slice(0, 800)}`
      : "";

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 600,
          system: `Du planst Browser-Automations-Schritte. Antworte NUR als JSON-Array mit maximal ${MAX_PLAN_STEPS} Schritten.
Jeder Schritt: {"action": "navigate|click|type|scroll|extract|wait", "target": "...", "value": "...", "url": "...", "needsScreenshot": true/false, "reasoning": "..."}
Minimiere Screenshots — nur bei Seitenwechseln oder wenn visuelle Verifikation nötig ist.`,
          messages: [
            {
              role: "user",
              content: `Task: ${task}\nURL: ${currentUrl}\nSeite: ${htmlSummary.slice(0, 400)}${structureHint}\n\nPlane die Schritte.`,
            },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return this.createQuickPlan(task, currentUrl, pageStructure);
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
      };
      const text = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return this.createQuickPlan(task, currentUrl, pageStructure);
      }

      const rawSteps = JSON.parse(jsonMatch[0]) as Array<{
        action?: string;
        target?: string;
        value?: string;
        url?: string;
        needsScreenshot?: boolean;
        reasoning?: string;
      }>;

      const steps: PlannedStep[] = rawSteps
        .slice(0, MAX_PLAN_STEPS)
        .map((raw) => ({
          action: (raw.action || "navigate") as PlannedStep["action"],
          target: raw.target,
          value: raw.value,
          url: raw.url,
          needsScreenshot: raw.needsScreenshot ?? false,
          needsVerification: raw.needsScreenshot ?? false,
          estimatedCreditCost: raw.needsScreenshot
            ? VISION_CREDIT_COST
            : 0,
          reasoning: raw.reasoning || "",
        }));

      const checkpointIndices = steps
        .map((s, i) => (s.needsScreenshot ? i : -1))
        .filter((i) => i >= 0);
      if (steps.length > 0 && !checkpointIndices.includes(steps.length - 1)) {
        checkpointIndices.push(steps.length - 1);
      }

      const plan: StepPlan = {
        steps,
        totalEstimatedCredits:
          HAIKU_CREDIT_COST + steps.reduce((sum, s) => sum + s.estimatedCreditCost, 0),
        checkpointIndices,
        hasReplannningFallback: true,
        confidence: 0.85,
      };

      this.planHistory.push(plan);
      return plan;
    } catch {
      return this.createQuickPlan(task, currentUrl, pageStructure);
    }
  }

  /**
   * Prüft ob ein Schritt im Plan ein Screenshot-Checkpoint ist.
   */
  isCheckpoint(plan: StepPlan, stepIndex: number): boolean {
    return plan.checkpointIndices.includes(stepIndex);
  }

  /**
   * Gibt die Plan-Historie zurück.
   */
  getHistory(): StepPlan[] {
    return this.planHistory;
  }

  /* ── Private: Task-spezifische Planstrategien ── */

  private planDataExtraction(
    task: string,
    currentUrl: string,
    pageStructure: PageStructure | null,
  ): PlannedStep[] {
    const steps: PlannedStep[] = [];

    // Prüfe ob Daten direkt auf der aktuellen Seite sind
    if (pageStructure?.prices.length) {
      steps.push({
        action: "extract",
        target: pageStructure.prices.map((p) => p.selector).join(", "),
        needsScreenshot: false,
        needsVerification: false,
        estimatedCreditCost: 0,
        reasoning: "Preise direkt aus DOM extrahieren (gecached)",
      });
      return steps;
    }

    // Seite laden (kein Screenshot nötig wenn HTML genügt)
    steps.push({
      action: "navigate",
      url: currentUrl,
      needsScreenshot: false,
      needsVerification: false,
      estimatedCreditCost: 0,
      reasoning: "Seite laden für DOM-Analyse",
    });

    // Suche wenn nötig
    const searchMatch = task.match(/(?:search|find|look for)\s+["']?([^"']+)/i);
    if (searchMatch && pageStructure?.searchField) {
      steps.push({
        action: "type",
        target: pageStructure.searchField,
        value: searchMatch[1].trim(),
        needsScreenshot: false,
        needsVerification: false,
        estimatedCreditCost: 0,
        reasoning: "Suchbegriff in bekanntes Suchfeld eingeben",
      });
      steps.push({
        action: "click",
        target: "submit",
        needsScreenshot: true,
        needsVerification: true,
        expectedOutcome: "Suchergebnisse angezeigt",
        estimatedCreditCost: VISION_CREDIT_COST,
        reasoning: "Suche absenden und Ergebnisse prüfen",
      });
    }

    // Extraktion (immer letzter Schritt)
    steps.push({
      action: "extract",
      needsScreenshot: true,
      needsVerification: true,
      expectedOutcome: "Daten erfolgreich extrahiert",
      estimatedCreditCost: VISION_CREDIT_COST,
      reasoning: "Daten von der Seite extrahieren",
    });

    return steps;
  }

  private planFormFill(
    task: string,
    pageStructure: PageStructure | null,
  ): PlannedStep[] {
    const steps: PlannedStep[] = [];

    if (pageStructure?.forms.length) {
      const form = pageStructure.forms[0];
      for (const field of form.fields) {
        steps.push({
          action: "type",
          target: field,
          needsScreenshot: false,
          needsVerification: false,
          estimatedCreditCost: 0,
          reasoning: `Feld "${field}" ausfüllen`,
        });
      }

      // Submit mit Screenshot
      steps.push({
        action: "click",
        target: "submit",
        needsScreenshot: true,
        needsVerification: true,
        expectedOutcome: "Formular erfolgreich abgesendet",
        estimatedCreditCost: VISION_CREDIT_COST,
        reasoning: "Formular absenden und Bestätigung prüfen",
      });
    } else {
      // Kein gecachtes Formular — Screenshot zur Orientierung
      steps.push({
        action: "navigate",
        needsScreenshot: true,
        needsVerification: false,
        estimatedCreditCost: VISION_CREDIT_COST,
        reasoning: "Seite analysieren um Formularfelder zu finden",
      });
    }

    return steps;
  }

  private planComparison(
    task: string,
    currentUrl: string,
  ): PlannedStep[] {
    // Vergleiche benötigen oft mehrere Seiten
    const urlMatches = task.match(/https?:\/\/[^\s]+/gi) || [];
    const steps: PlannedStep[] = [];

    if (urlMatches.length > 1) {
      for (const url of urlMatches.slice(0, 4)) {
        steps.push({
          action: "navigate",
          url,
          needsScreenshot: false,
          needsVerification: false,
          estimatedCreditCost: 0,
          reasoning: `Seite laden: ${url}`,
        });
        steps.push({
          action: "extract",
          needsScreenshot: true,
          needsVerification: false,
          estimatedCreditCost: VISION_CREDIT_COST,
          reasoning: "Daten für Vergleich extrahieren",
        });
      }
    } else {
      steps.push({
        action: "navigate",
        url: currentUrl,
        needsScreenshot: true,
        needsVerification: false,
        estimatedCreditCost: VISION_CREDIT_COST,
        reasoning: "Seite für Vergleich laden",
      });
      steps.push({
        action: "extract",
        needsScreenshot: false,
        needsVerification: true,
        estimatedCreditCost: 0,
        reasoning: "Vergleichsdaten extrahieren",
      });
    }

    return steps;
  }

  private planSearch(
    task: string,
    pageStructure: PageStructure | null,
  ): PlannedStep[] {
    const steps: PlannedStep[] = [];

    if (pageStructure?.searchField) {
      steps.push({
        action: "type",
        target: pageStructure.searchField,
        needsScreenshot: false,
        needsVerification: false,
        estimatedCreditCost: 0,
        reasoning: "Suchbegriff in bekanntes Suchfeld",
      });
      steps.push({
        action: "click",
        target: "submit",
        needsScreenshot: true,
        needsVerification: true,
        estimatedCreditCost: VISION_CREDIT_COST,
        reasoning: "Suche absenden",
      });
    } else {
      steps.push({
        action: "navigate",
        needsScreenshot: true,
        needsVerification: false,
        estimatedCreditCost: VISION_CREDIT_COST,
        reasoning: "Seite laden um Suchfunktion zu finden",
      });
    }

    steps.push({
      action: "extract",
      needsScreenshot: false,
      needsVerification: true,
      estimatedCreditCost: 0,
      reasoning: "Suchergebnisse extrahieren",
    });

    return steps;
  }

  private planNavigation(task: string): PlannedStep[] {
    void task;
    return [
      {
        action: "navigate",
        needsScreenshot: true,
        needsVerification: true,
        expectedOutcome: "Zielseite geladen",
        estimatedCreditCost: VISION_CREDIT_COST,
        reasoning: "Zur Zielseite navigieren",
      },
    ];
  }

  private planMonitoring(task: string, currentUrl: string): PlannedStep[] {
    return [
      {
        action: "navigate",
        url: currentUrl,
        needsScreenshot: false,
        needsVerification: false,
        estimatedCreditCost: 0,
        reasoning: "Seite laden für Monitoring",
      },
      {
        action: "extract",
        needsScreenshot: true,
        needsVerification: true,
        expectedOutcome: "Status-Daten extrahiert",
        estimatedCreditCost: VISION_CREDIT_COST,
        reasoning: "Status-Daten prüfen und extrahieren",
      },
    ];
  }
}
