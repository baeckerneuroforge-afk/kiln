/**
 * Adaptive Screenshot Strategy
 * Entscheidet intelligent wann Screenshots nötig sind und in welcher Qualität.
 * Reduziert unnötige Vision-API-Aufrufe und spart Credits.
 */

/* ── Types ── */

export interface ScreenshotDecision {
  shouldCapture: boolean;
  reason: string;
}

export interface ScreenshotQuality {
  quality: number; // 0-100
  width: number;
  format: "png" | "jpeg";
}

type ActionType = "navigate" | "click" | "click_link" | "type" | "scroll" | "extract_data" | "done" | "analyze" | "execute_code";
type ScreenshotPurpose = "navigation_verify" | "data_extraction" | "verification_checkpoint" | "initial";

// Aktionen die immer einen Screenshot erfordern
const ALWAYS_SCREENSHOT: Set<ActionType> = new Set([
  "navigate",
  "click_link",
]);

// Aktionen die nie einen Screenshot erfordern
const NEVER_SCREENSHOT: Set<ActionType> = new Set([
  "done",
  "analyze",
]);

/* ── Screenshot Strategy ── */

export class ScreenshotStrategy {
  private screenshotsTaken = 0;
  private screenshotsSkipped = 0;
  private stepsSinceLastScreenshot = 0;

  /** Safety-Net: nach N Aktionen wird immer ein Screenshot erzwungen */
  private readonly forceEveryN: number;

  constructor(forceEveryN: number = 5) {
    this.forceEveryN = forceEveryN;
  }

  /**
   * Entscheidet ob nach einer Aktion ein Screenshot genommen werden soll.
   */
  shouldTakeScreenshot(
    lastAction: ActionType,
    nextAction?: ActionType,
  ): ScreenshotDecision {
    this.stepsSinceLastScreenshot++;

    // Safety-Net: erzwinge Screenshot alle N Schritte
    if (this.stepsSinceLastScreenshot >= this.forceEveryN) {
      return this.capture("Safety-Net: alle " + this.forceEveryN + " Schritte");
    }

    // ALWAYS: nach Navigationen und Link-Klicks
    if (ALWAYS_SCREENSHOT.has(lastAction)) {
      return this.capture("Navigation/Link-Klick — Seitenänderung");
    }

    // NEVER: nach done, analyze
    if (NEVER_SCREENSHOT.has(lastAction)) {
      return this.skip("Kein Screenshot nötig nach " + lastAction);
    }

    // CLICK: nur bei state-changing Clicks (Links, Buttons — nicht auf Textfelder)
    if (lastAction === "click") {
      // Wenn die nächste Aktion ein "type" ist, war der Click vermutlich auf ein Input-Feld
      if (nextAction === "type") {
        return this.skip("Click auf Input-Feld — kein State-Change erwartet");
      }
      return this.capture("Click auf interaktives Element");
    }

    // TYPE: nur Screenshot wenn es das letzte Feld vor Submit war
    if (lastAction === "type") {
      if (nextAction === "click" || nextAction === "navigate") {
        return this.capture("Typing abgeschlossen — nächste Aktion ist Submit/Navigate");
      }
      return this.skip("Typing — weitere Eingaben erwartet");
    }

    // SCROLL: nur nach 3+ Scrolls ohne Screenshot
    if (lastAction === "scroll") {
      if (this.stepsSinceLastScreenshot >= 3) {
        return this.capture("3+ Scrolls ohne Screenshot");
      }
      return this.skip("Scroll — noch nicht genug Schritte");
    }

    // EXTRACT_DATA: braucht keinen Screenshot (DOM-basiert)
    if (lastAction === "extract_data") {
      return this.skip("Daten-Extraktion ist DOM-basiert");
    }

    // EXECUTE_CODE: Code-Output ist Text, kein Screenshot nötig
    if (lastAction === "execute_code") {
      return this.skip("Code-Ausführung — Output ist Text");
    }

    // Default: Screenshot nehmen (sicher)
    return this.capture("Default-Verhalten");
  }

  /**
   * Bestimmt die Screenshot-Qualität basierend auf dem Zweck.
   */
  getScreenshotQuality(purpose: ScreenshotPurpose): ScreenshotQuality {
    switch (purpose) {
      case "navigation_verify":
        return { quality: 50, width: 800, format: "jpeg" };
      case "data_extraction":
        return { quality: 90, width: 1400, format: "png" };
      case "verification_checkpoint":
        return { quality: 70, width: 1000, format: "jpeg" };
      case "initial":
        return { quality: 80, width: 1280, format: "png" };
    }
  }

  /**
   * Schätzt die Vision-API-Kosten für einen Screenshot.
   */
  estimateVisionTokens(quality: ScreenshotQuality): number {
    // Grobe Schätzung: ~1000 Tokens pro 100x100px bei hoher Qualität
    const height = Math.round(quality.width * 0.625); // 16:10 Ratio
    const pixels = quality.width * height;
    const qualityFactor = quality.quality / 100;
    return Math.round((pixels / 10000) * qualityFactor * 85);
  }

  /** Gibt Statistiken zurück */
  getStats(): { taken: number; skipped: number; savedPercent: number } {
    const total = this.screenshotsTaken + this.screenshotsSkipped;
    return {
      taken: this.screenshotsTaken,
      skipped: this.screenshotsSkipped,
      savedPercent: total > 0 ? Math.round((this.screenshotsSkipped / total) * 100) : 0,
    };
  }

  private capture(reason: string): ScreenshotDecision {
    this.screenshotsTaken++;
    this.stepsSinceLastScreenshot = 0;
    return { shouldCapture: true, reason };
  }

  private skip(reason: string): ScreenshotDecision {
    this.screenshotsSkipped++;
    return { shouldCapture: false, reason };
  }
}
