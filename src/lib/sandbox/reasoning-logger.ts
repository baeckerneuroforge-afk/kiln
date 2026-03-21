/**
 * Reasoning Transparency Engine
 * Erfasst die Gedankengänge des Agents, nicht nur Aktionen.
 * Speichert strukturierte Reasoning-Einträge für Nachvollziehbarkeit.
 */

export interface ReasoningEntry {
  timestamp: string;
  step: number;
  /** Was der Agent gesehen hat */
  observation: string;
  /** Was der Agent gedacht hat */
  reasoning: string;
  /** Welche Aktion gewählt wurde */
  action: string;
  /** Ziel der Aktion */
  target?: string;
  /** Confidence-Level (0.0 - 1.0) */
  confidence: number;
  /** Alternativen die in Betracht gezogen wurden */
  alternativesConsidered: string[];
  /** Verifikations-Ergebnis (falls vorhanden) */
  verificationResult?: {
    success: boolean;
    confidence: number;
    issue?: string;
  };
  /** Screenshot-Referenz */
  screenshotRef?: string;
  /** Dauer der Entscheidungsfindung */
  thinkingDurationMs: number;
}

export interface ReasoningSummary {
  totalSteps: number;
  averageConfidence: number;
  lowConfidenceSteps: number;
  failedVerifications: number;
  topActions: Array<{ action: string; count: number }>;
  totalThinkingTimeMs: number;
}

export class ReasoningLogger {
  private entries: ReasoningEntry[] = [];

  /**
   * Erstellt einen neuen Reasoning-Eintrag
   */
  log(entry: Omit<ReasoningEntry, "timestamp">): void {
    this.entries.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Extrahiert Reasoning aus einer Claude-Antwort und Action.
   * Parst die reasoning-Felder aus der LLM-Response.
   */
  logFromClaudeAction(
    step: number,
    action: string,
    reasoning: string,
    target?: string,
    thinkingDurationMs: number = 0,
    screenshotRef?: string,
  ): void {
    // Confidence aus dem Reasoning-Text extrahieren
    const confidence = this.estimateConfidence(reasoning, action);
    const alternatives = this.extractAlternatives(reasoning);
    const observation = this.extractObservation(reasoning);

    this.entries.push({
      timestamp: new Date().toISOString(),
      step,
      observation,
      reasoning,
      action,
      target,
      confidence,
      alternativesConsidered: alternatives,
      screenshotRef,
      thinkingDurationMs,
    });
  }

  /**
   * Fügt Verifikationsergebnis zum letzten Eintrag hinzu
   */
  addVerificationResult(
    stepIndex: number,
    result: { success: boolean; confidence: number; issue?: string },
  ): void {
    const entry = this.entries.find((e) => e.step === stepIndex);
    if (entry) {
      entry.verificationResult = result;
    }
  }

  /**
   * Schätzt die Confidence basierend auf Reasoning-Text und Aktionstyp
   */
  private estimateConfidence(reasoning: string, action: string): number {
    const lower = reasoning.toLowerCase();
    let confidence = 0.8; // Basis

    // Positive Indikatoren
    if (lower.includes("klar") || lower.includes("offensichtlich") || lower.includes("clearly")) {
      confidence += 0.1;
    }
    if (lower.includes("sicher") || lower.includes("confident") || lower.includes("certain")) {
      confidence += 0.1;
    }

    // Negative Indikatoren
    if (lower.includes("vielleicht") || lower.includes("maybe") || lower.includes("might")) {
      confidence -= 0.15;
    }
    if (lower.includes("unsicher") || lower.includes("uncertain") || lower.includes("unklar")) {
      confidence -= 0.2;
    }
    if (lower.includes("versuch") || lower.includes("try") || lower.includes("attempt")) {
      confidence -= 0.1;
    }

    // Done-Aktionen haben generell höhere Confidence
    if (action === "done") confidence = Math.max(confidence, 0.85);

    // Scroll ist niedrige Relevanz
    if (action === "scroll") confidence = Math.max(confidence, 0.9);

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Extrahiert erwähnte Alternativen aus dem Reasoning-Text
   */
  private extractAlternatives(reasoning: string): string[] {
    const alternatives: string[] = [];
    const lower = reasoning.toLowerCase();

    // Muster: "alternativ...", "stattdessen...", "could also...", "oder..."
    const patterns = [
      /alternativ[:\s]+([^.]+)/gi,
      /stattdessen[:\s]+([^.]+)/gi,
      /could also[:\s]+([^.]+)/gi,
      /oder[:\s]+([^.]+)/gi,
      /another option[:\s]+([^.]+)/gi,
    ];

    for (const pattern of patterns) {
      const match = lower.match(pattern);
      if (match) {
        alternatives.push(match[0].trim());
      }
    }

    return alternatives.slice(0, 3); // Max 3 Alternativen
  }

  /**
   * Extrahiert die Beobachtung aus dem Reasoning
   */
  private extractObservation(reasoning: string): string {
    // Versuche "Ich sehe...", "Die Seite zeigt...", "I see..." Muster zu finden
    const patterns = [
      /ich sehe[:\s]+([^.]+)/i,
      /die seite zeigt[:\s]+([^.]+)/i,
      /i see[:\s]+([^.]+)/i,
      /the page shows?[:\s]+([^.]+)/i,
      /es gibt[:\s]+([^.]+)/i,
    ];

    for (const pattern of patterns) {
      const match = reasoning.match(pattern);
      if (match) return match[0].trim();
    }

    // Fallback: Erste 100 Zeichen des Reasonings
    return reasoning.slice(0, 100);
  }

  /**
   * Gibt alle Einträge zurück
   */
  getEntries(): ReasoningEntry[] {
    return [...this.entries];
  }

  /**
   * Gibt Einträge mit niedrigem Confidence zurück
   */
  getLowConfidenceEntries(threshold: number = 0.6): ReasoningEntry[] {
    return this.entries.filter((e) => e.confidence < threshold);
  }

  /**
   * Gibt nur fehlgeschlagene Verifikationen zurück
   */
  getFailedVerifications(): ReasoningEntry[] {
    return this.entries.filter(
      (e) => e.verificationResult && !e.verificationResult.success,
    );
  }

  /**
   * Erstellt eine Zusammenfassung
   */
  getSummary(): ReasoningSummary {
    if (this.entries.length === 0) {
      return {
        totalSteps: 0,
        averageConfidence: 0,
        lowConfidenceSteps: 0,
        failedVerifications: 0,
        topActions: [],
        totalThinkingTimeMs: 0,
      };
    }

    const avgConf = this.entries.reduce((sum, e) => sum + e.confidence, 0) / this.entries.length;
    const lowConf = this.entries.filter((e) => e.confidence < 0.6).length;
    const failedVer = this.entries.filter(
      (e) => e.verificationResult && !e.verificationResult.success,
    ).length;

    // Top-Aktionen zählen
    const actionCounts = new Map<string, number>();
    for (const e of this.entries) {
      actionCounts.set(e.action, (actionCounts.get(e.action) || 0) + 1);
    }
    const topActions = Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const totalThinking = this.entries.reduce((sum, e) => sum + e.thinkingDurationMs, 0);

    return {
      totalSteps: this.entries.length,
      averageConfidence: Math.round(avgConf * 100) / 100,
      lowConfidenceSteps: lowConf,
      failedVerifications: failedVer,
      topActions,
      totalThinkingTimeMs: totalThinking,
    };
  }

  /**
   * Serialisiert den Log als JSON (für DB-Speicherung)
   */
  toJSON(): ReasoningEntry[] {
    return this.entries;
  }

  /**
   * Lädt Einträge aus serialisiertem JSON
   */
  static fromJSON(data: unknown): ReasoningLogger {
    const logger = new ReasoningLogger();
    if (Array.isArray(data)) {
      logger.entries = data as ReasoningEntry[];
    }
    return logger;
  }

  reset(): void {
    this.entries = [];
  }
}
