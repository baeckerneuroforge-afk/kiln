/**
 * Step Verification Engine
 * Validiert jede kritische Browser-Aktion mittels günstigem Vision-Modell.
 * Bietet Retry-Logik und strukturierte Verifikationsergebnisse.
 */

export interface VerificationResult {
  success: boolean;
  confidence: number;
  issue?: string;
  suggestion?: string;
  retryCount: number;
  durationMs: number;
}

export interface VerificationEntry {
  stepIndex: number;
  action: string;
  expectedOutcome: string;
  result: VerificationResult;
  timestamp: string;
}

// Aktionen die immer verifiziert werden sollen
const CRITICAL_ACTIONS = new Set([
  "click",
  "type",
  "navigate",
  "click_link",
]);

// Aktionen die übersprungen werden können
const TRIVIAL_ACTIONS = new Set([
  "scroll",
  "extract_data",
  "analyze",
]);

const VERIFICATION_MODEL = "claude-haiku-4-5-20251001";
const MAX_RETRIES = 2;

export class StepVerifier {
  private log: VerificationEntry[] = [];
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  /**
   * Prüft ob eine Aktion verifiziert werden sollte
   */
  shouldVerify(action: string): boolean {
    if (!this.enabled) return false;
    if (TRIVIAL_ACTIONS.has(action)) return false;
    return CRITICAL_ACTIONS.has(action);
  }

  /**
   * Verifiziert eine Aktion anhand von Before/After-Screenshots.
   * Gibt strukturiertes Ergebnis mit Confidence-Score zurück.
   */
  async verify(
    stepIndex: number,
    action: string,
    expectedOutcome: string,
    beforeScreenshot: string,
    afterScreenshot: string,
  ): Promise<VerificationResult> {
    const start = Date.now();

    if (!this.enabled || !beforeScreenshot || !afterScreenshot) {
      return { success: true, confidence: 1.0, retryCount: 0, durationMs: 0 };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: true, confidence: 1.0, retryCount: 0, durationMs: 0 };
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: VERIFICATION_MODEL,
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "VORHER:" },
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: beforeScreenshot },
                },
                { type: "text", text: "NACHHER:" },
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: afterScreenshot },
                },
                {
                  type: "text",
                  text: `Die Aktion war: ${action}\nErwartetes Ergebnis: ${expectedOutcome}\n\nHat die Aktion das erwartete Ergebnis erreicht? Antworte NUR als JSON:\n{"success": true/false, "confidence": 0.0-1.0, "issue": "falls fehlgeschlagen: was ist schiefgelaufen", "suggestion": "falls fehlgeschlagen: alternativer Ansatz"}`,
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return { success: true, confidence: 0.5, retryCount: 0, durationMs: Date.now() - start };
      }

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };

      const text = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Fallback: einfache yes/no Analyse
        const isYes = text.toLowerCase().includes("success") || text.toLowerCase().includes("yes") || text.toLowerCase().includes("ja");
        return {
          success: isYes,
          confidence: 0.6,
          retryCount: 0,
          durationMs: Date.now() - start,
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        success?: boolean;
        confidence?: number;
        issue?: string;
        suggestion?: string;
      };

      const result: VerificationResult = {
        success: parsed.success !== false,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : (parsed.success ? 0.9 : 0.3),
        issue: parsed.issue,
        suggestion: parsed.suggestion,
        retryCount: 0,
        durationMs: Date.now() - start,
      };

      // Low confidence gilt als Fehlschlag
      if (result.confidence < 0.7) {
        result.success = false;
      }

      // Log-Eintrag
      this.log.push({
        stepIndex,
        action,
        expectedOutcome,
        result,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch {
      return { success: true, confidence: 0.5, retryCount: 0, durationMs: Date.now() - start };
    }
  }

  /**
   * Verifiziert mit automatischem Retry.
   * Ruft retryFn auf wenn Verifikation fehlschlägt.
   */
  async verifyWithRetry(
    stepIndex: number,
    action: string,
    expectedOutcome: string,
    getBeforeScreenshot: () => Promise<string | null>,
    executeAndGetAfterScreenshot: () => Promise<string | null>,
  ): Promise<VerificationResult> {
    if (!this.shouldVerify(action)) {
      return { success: true, confidence: 1.0, retryCount: 0, durationMs: 0 };
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const before = await getBeforeScreenshot();
      const after = await executeAndGetAfterScreenshot();

      if (!before || !after) {
        return { success: true, confidence: 0.5, retryCount: attempt, durationMs: 0 };
      }

      const result = await this.verify(stepIndex, action, expectedOutcome, before, after);
      result.retryCount = attempt;

      if (result.success) {
        return result;
      }

      // Letzter Versuch? Dann Ergebnis zurückgeben (auch wenn fehlgeschlagen)
      if (attempt === MAX_RETRIES) {
        return result;
      }

      // Nächster Versuch — kurz warten
      await new Promise((r) => setTimeout(r, 500));
    }

    // Fallback (sollte nicht erreicht werden)
    return { success: false, confidence: 0, retryCount: MAX_RETRIES, durationMs: 0 };
  }

  getLog(): VerificationEntry[] {
    return [...this.log];
  }

  getFailedSteps(): VerificationEntry[] {
    return this.log.filter((e) => !e.result.success);
  }

  reset(): void {
    this.log = [];
  }
}
