/**
 * Output Quality Assurance
 * Poliert Agent-Outputs für professionelle Qualität.
 * Nutzt Haiku für günstige Qualitätsprüfungen.
 */

import Anthropic from "@anthropic-ai/sdk";

/* ── Types ── */

export type OutputType =
  | "report"
  | "table"
  | "email"
  | "presentation"
  | "code"
  | "summary"
  | "comparison";

export interface PolishResult {
  polishedOutput: string;
  qualityScore: number;
  issues: PolishIssue[];
  improvementsMade: string[];
}

export interface PolishIssue {
  type: "structure" | "accuracy" | "formatting" | "hallucination" | "grammar" | "placeholder";
  severity: "low" | "medium" | "high";
  description: string;
  location?: string;
}

export interface QualityAssessment {
  score: number;
  breakdown: {
    completeness: number;
    accuracy: number;
    formatting: number;
    readability: number;
  };
  issues: PolishIssue[];
  recommendation: "ready" | "minor_issues" | "needs_review" | "needs_rerun";
}

/* ── Polishing Rules per Type ── */

const TYPE_RULES: Record<OutputType, string> = {
  report: `Prüfe die Struktur (Einleitung, Ergebnisse, Fazit).
Stelle sicher, dass alle Daten belegt sind (keine ungestützten Behauptungen).
Formatierung: konsistente Überschriften, Aufzählungen, nummerierte Listen.`,

  table: `Stelle sicher, dass alle Zeilen dieselben Spalten haben.
Sortiere nach der relevantesten Spalte.
Markiere beste/schlechteste Werte.
Format: saubere CSV- oder HTML-Tabelle.`,

  comparison: `Stelle sicher, dass alle Entitäten nach denselben Kriterien verglichen werden.
Füge "Gewinner" oder "Bestes Preis-Leistungs-Verhältnis" Indikatoren hinzu.
Jeder Datenpunkt braucht eine Quelle.
Format: Side-by-Side oder tabellarisch.`,

  email: `Prüfe den Ton (formal/locker passend zum Kontext).
Pflichtfelder: Betreff, Anrede, Text, Grußformel.
Suche nach Platzhaltern die nicht ausgefüllt wurden (z.B. [NAME], {{company}}).`,

  code: `Prüfe auf offensichtliche Fehler (nicht geschlossene Klammern, undefinierte Variablen).
Prüfe auf fehlende Imports oder Abhängigkeiten.
Füge Kommentare für komplexe Abschnitte hinzu.`,

  summary: `Prüfe ob alle Kernpunkte abgedeckt sind.
Keine Details die nicht im Quellmaterial vorkommen.
Klare, prägnante Sprache.`,

  presentation: `Prüfe Folienstruktur (Titel, Kernaussage, Unterstützungspunkte).
Maximal 6 Punkte pro Folie.
Konsistenter Stil über alle Folien.`,
};

/* ── Output Polisher ── */

export class OutputPolisher {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
  }

  /**
   * Poliert einen Raw-Output basierend auf seinem Typ.
   */
  async polish(
    rawOutput: string,
    outputType: OutputType,
    context?: { reasoningLog?: string; toolResults?: string[] }
  ): Promise<PolishResult> {
    const issues: PolishIssue[] = [];
    const improvements: string[] = [];

    // 1. Typ-spezifische Prüfungen
    const typeIssues = this.checkTypeSpecific(rawOutput, outputType);
    issues.push(...typeIssues);

    // 2. Allgemeine Prüfungen
    const generalIssues = this.checkGeneral(rawOutput);
    issues.push(...generalIssues);

    // 3. Halluzinations-Check (wenn Tool-Ergebnisse vorhanden)
    if (context?.toolResults && context.toolResults.length > 0) {
      const hallucinationIssues = this.checkHallucinations(
        rawOutput,
        context.toolResults
      );
      issues.push(...hallucinationIssues);
    }

    // 4. LLM-basiertes Polishing (nur bei Problemen oder für bestimmte Typen)
    let polishedOutput = rawOutput;
    if (issues.some((i) => i.severity !== "low") || ["report", "comparison", "email"].includes(outputType)) {
      const polishResult = await this.llmPolish(rawOutput, outputType, issues);
      polishedOutput = polishResult.output;
      improvements.push(...polishResult.improvements);
    }

    // 5. Quality Score berechnen
    const score = this.calculateScore(polishedOutput, outputType, issues);

    return {
      polishedOutput,
      qualityScore: score,
      issues,
      improvementsMade: improvements,
    };
  }

  /**
   * Berechnet einen Qualitäts-Score (0-100) für einen Output.
   */
  async qualityScore(
    output: string,
    outputType: OutputType
  ): Promise<QualityAssessment> {
    const issues: PolishIssue[] = [
      ...this.checkTypeSpecific(output, outputType),
      ...this.checkGeneral(output),
    ];

    const score = this.calculateScore(output, outputType, issues);

    const breakdown = {
      completeness: Math.min(100, Math.max(0, 100 - issues.filter((i) => i.type === "structure").length * 15)),
      accuracy: Math.min(100, Math.max(0, 100 - issues.filter((i) => i.type === "accuracy" || i.type === "hallucination").length * 20)),
      formatting: Math.min(100, Math.max(0, 100 - issues.filter((i) => i.type === "formatting").length * 10)),
      readability: Math.min(100, Math.max(0, 100 - issues.filter((i) => i.type === "grammar").length * 5)),
    };

    let recommendation: QualityAssessment["recommendation"];
    if (score >= 80) recommendation = "ready";
    else if (score >= 60) recommendation = "minor_issues";
    else if (score >= 40) recommendation = "needs_review";
    else recommendation = "needs_rerun";

    return { score, breakdown, issues, recommendation };
  }

  /* ── Type-Specific Checks ── */

  private checkTypeSpecific(output: string, type: OutputType): PolishIssue[] {
    const issues: PolishIssue[] = [];

    switch (type) {
      case "report": {
        if (!output.match(/#{1,3}\s/)) {
          issues.push({ type: "structure", severity: "medium", description: "Keine Überschriften gefunden" });
        }
        if (output.length < 200) {
          issues.push({ type: "structure", severity: "medium", description: "Report ist sehr kurz" });
        }
        break;
      }
      case "table": {
        const lines = output.split("\n").filter(Boolean);
        const pipeLines = lines.filter((l) => l.includes("|"));
        if (pipeLines.length > 0) {
          const colCounts = pipeLines.map((l) => l.split("|").length);
          const inconsistent = colCounts.some((c) => c !== colCounts[0]);
          if (inconsistent) {
            issues.push({ type: "formatting", severity: "high", description: "Inkonsistente Spaltenanzahl in Tabelle" });
          }
        }
        break;
      }
      case "email": {
        const placeholders = output.match(/\[[\w\s]+\]|{{[\w\s]+}}/g);
        if (placeholders) {
          issues.push({
            type: "placeholder",
            severity: "high",
            description: `Nicht ausgefüllte Platzhalter: ${placeholders.join(", ")}`,
          });
        }
        if (!output.match(/^(Sehr geehrte|Hallo|Hi|Dear|Liebe)/m)) {
          issues.push({ type: "structure", severity: "low", description: "Keine Anrede gefunden" });
        }
        break;
      }
      case "code": {
        const openBraces = (output.match(/{/g) || []).length;
        const closeBraces = (output.match(/}/g) || []).length;
        if (openBraces !== closeBraces) {
          issues.push({ type: "accuracy", severity: "high", description: "Ungleiche Anzahl offener/geschlossener Klammern" });
        }
        const openParens = (output.match(/\(/g) || []).length;
        const closeParens = (output.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
          issues.push({ type: "accuracy", severity: "medium", description: "Ungleiche Anzahl Klammern ()" });
        }
        break;
      }
      case "comparison": {
        if (!output.match(/\|.*\|/)) {
          issues.push({ type: "formatting", severity: "low", description: "Vergleich nicht in Tabellenform" });
        }
        break;
      }
    }

    return issues;
  }

  /* ── General Checks ── */

  private checkGeneral(output: string): PolishIssue[] {
    const issues: PolishIssue[] = [];

    // Leerer Output
    if (!output || output.trim().length < 10) {
      issues.push({ type: "structure", severity: "high", description: "Output ist leer oder zu kurz" });
    }

    // Platzhalter
    const genericPlaceholders = output.match(/\b(TODO|FIXME|XXX|PLACEHOLDER|INSERT HERE)\b/gi);
    if (genericPlaceholders) {
      issues.push({
        type: "placeholder",
        severity: "high",
        description: `Platzhalter im Output: ${genericPlaceholders.slice(0, 3).join(", ")}`,
      });
    }

    // Abgebrochener Output (endet mitten im Satz)
    const lastChar = output.trim().slice(-1);
    if (output.length > 100 && !".!?:;)]}\"'`>".includes(lastChar)) {
      issues.push({ type: "structure", severity: "medium", description: "Output scheint abgeschnitten zu sein" });
    }

    return issues;
  }

  /* ── Hallucination Detection ── */

  private checkHallucinations(
    output: string,
    toolResults: string[]
  ): PolishIssue[] {
    const issues: PolishIssue[] = [];

    // Extrahiere Zahlen aus dem Output
    const outputNumbers = output.match(/\d[\d,.]+/g) || [];
    const sourceText = toolResults.join(" ");

    // Prüfe ob spezifische Zahlen im Output auch in den Quellen vorkommen
    for (const num of outputNumbers) {
      // Überspringe triviale Zahlen (1-stellig, Jahreszahlen, etc.)
      if (num.length <= 2) continue;
      if (/^20[12]\d$/.test(num)) continue;

      if (!sourceText.includes(num)) {
        // Prüfe auch ohne Tausendertrennzeichen
        const normalized = num.replace(/[.,]/g, "");
        const sourceNormalized = sourceText.replace(/[.,]/g, "");
        if (!sourceNormalized.includes(normalized) && normalized.length > 3) {
          issues.push({
            type: "hallucination",
            severity: "medium",
            description: `Zahl "${num}" nicht in den Quelldaten gefunden`,
            location: num,
          });
        }
      }
    }

    return issues;
  }

  /* ── LLM Polish ── */

  private async llmPolish(
    output: string,
    type: OutputType,
    issues: PolishIssue[]
  ): Promise<{ output: string; improvements: string[] }> {
    if (!this.apiKey) {
      return { output, improvements: [] };
    }

    const rules = TYPE_RULES[type];
    const issueList = issues
      .filter((i) => i.severity !== "low")
      .map((i) => `- ${i.description}`)
      .join("\n");

    try {
      const client = new Anthropic({ apiKey: this.apiKey });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `Du bist ein Output-Polisher. Verbessere den folgenden ${type}-Output.

Regeln für diesen Typ:
${rules}

Gefundene Probleme:
${issueList || "Keine kritischen Probleme"}

WICHTIG:
- Ändere KEINE Fakten oder Zahlen
- Verbessere nur Struktur, Formatierung und Lesbarkeit
- Gib NUR den verbesserten Output zurück, keine Erklärungen

Original:
${output.slice(0, 6000)}`,
          },
        ],
      });

      const block = response.content[0];
      const polished = block.type === "text" ? block.text : output;

      const improvements: string[] = [];
      if (polished !== output) {
        improvements.push("Formatierung verbessert");
        if (issues.some((i) => i.type === "structure")) improvements.push("Struktur angepasst");
        if (issues.some((i) => i.type === "grammar")) improvements.push("Grammatik korrigiert");
      }

      return { output: polished, improvements };
    } catch {
      return { output, improvements: [] };
    }
  }

  /* ── Score Calculation ── */

  private calculateScore(
    output: string,
    _type: OutputType,
    issues: PolishIssue[]
  ): number {
    let score = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case "high":
          score -= 20;
          break;
        case "medium":
          score -= 10;
          break;
        case "low":
          score -= 3;
          break;
      }
    }

    // Bonus für Länge (nicht zu kurz, nicht absurd lang)
    if (output.length > 100 && output.length < 50000) score += 5;

    return Math.max(0, Math.min(100, score));
  }
}
