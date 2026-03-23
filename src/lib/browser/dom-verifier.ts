/**
 * DOM-Based Verification
 * Verifiziert Browser-Aktionen über DOM-State statt teurer Vision-Screenshots.
 * Kostet 0 Credits (kein LLM-Aufruf).
 */

import type { BrowserSession } from "@/lib/browser-service";
import { executeScript } from "@/lib/browser-service";

/* ── Types ── */

export interface DomVerification {
  verified: boolean;
  confidence: number; // 0.0 - 1.0
  method: string;
  details: Record<string, unknown>;
  /** true = Ergebnis ist eindeutig; false = Vision-Fallback empfohlen */
  conclusive: boolean;
}

/* ── DOM Verifier ── */

export class DomVerifier {
  private stats = { domVerified: 0, inconclusive: 0, total: 0 };

  /**
   * Verifiziert ob eine Navigation erfolgreich war.
   */
  async verifyNavigation(
    session: BrowserSession,
    url: string,
    expectedUrlPart?: string,
  ): Promise<DomVerification> {
    this.stats.total++;

    const script = `
      return {
        url: window.location.href,
        title: document.title || '',
        hasError: !!document.querySelector('.error, .not-found, [class*="error"], [class*="404"]'),
        bodyText: (document.body?.innerText || '').slice(0, 500).toLowerCase(),
        statusIndicators: {
          has404: document.title.includes('404') || document.body?.innerText?.includes('404') || false,
          has500: document.title.includes('500') || document.body?.innerText?.includes('500') || false,
          hasNotFound: (document.body?.innerText || '').toLowerCase().includes('not found'),
          hasAccessDenied: (document.body?.innerText || '').toLowerCase().includes('access denied'),
          hasForbidden: (document.body?.innerText || '').toLowerCase().includes('forbidden'),
        },
        contentLength: (document.body?.innerHTML || '').length,
      };
    `;

    try {
      const result = await executeScript(session, url, script);
      if (!result.success) {
        this.stats.inconclusive++;
        return { verified: false, confidence: 0, method: "dom_nav", details: {}, conclusive: false };
      }

      const data = result.result as {
        url: string;
        title: string;
        hasError: boolean;
        statusIndicators: Record<string, boolean>;
        contentLength: number;
      };

      // Fehlerseite erkannt
      const hasError = data.hasError ||
        data.statusIndicators.has404 ||
        data.statusIndicators.has500 ||
        data.statusIndicators.hasNotFound ||
        data.statusIndicators.hasAccessDenied ||
        data.statusIndicators.hasForbidden;

      if (hasError) {
        this.stats.domVerified++;
        return {
          verified: false,
          confidence: 0.9,
          method: "dom_nav_error",
          details: { currentUrl: data.url, title: data.title, errors: data.statusIndicators },
          conclusive: true,
        };
      }

      // URL-Check
      if (expectedUrlPart) {
        const urlMatch = data.url.toLowerCase().includes(expectedUrlPart.toLowerCase());
        if (urlMatch) {
          this.stats.domVerified++;
          return {
            verified: true,
            confidence: 0.95,
            method: "dom_nav_url_match",
            details: { currentUrl: data.url, title: data.title },
            conclusive: true,
          };
        }
      }

      // Seite hat Content → vermutlich erfolgreich
      if (data.contentLength > 500 && data.title) {
        this.stats.domVerified++;
        return {
          verified: true,
          confidence: 0.80,
          method: "dom_nav_content",
          details: { currentUrl: data.url, title: data.title, contentLength: data.contentLength },
          conclusive: true,
        };
      }

      this.stats.inconclusive++;
      return {
        verified: false,
        confidence: 0.3,
        method: "dom_nav_inconclusive",
        details: { currentUrl: data.url, contentLength: data.contentLength },
        conclusive: false,
      };
    } catch {
      this.stats.inconclusive++;
      return { verified: false, confidence: 0, method: "dom_nav_error", details: {}, conclusive: false };
    }
  }

  /**
   * Verifiziert ob ein Click erfolgreich war.
   * Vergleicht DOM-Zustand vor und nach dem Click.
   */
  async verifyClick(
    session: BrowserSession,
    url: string,
    previousUrl: string,
  ): Promise<DomVerification> {
    this.stats.total++;

    const script = `
      return {
        url: window.location.href,
        title: document.title || '',
        modalsOpen: document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="popup"], [class*="overlay"]').length,
        activeElement: document.activeElement?.tagName || '',
        bodyLength: (document.body?.innerHTML || '').length,
        alertPresent: false,
      };
    `;

    try {
      const result = await executeScript(session, url, script);
      if (!result.success) {
        this.stats.inconclusive++;
        return { verified: false, confidence: 0, method: "dom_click", details: {}, conclusive: false };
      }

      const data = result.result as {
        url: string;
        title: string;
        modalsOpen: number;
        activeElement: string;
        bodyLength: number;
      };

      // URL hat sich geändert → Click war erfolgreich (Navigation)
      if (data.url !== previousUrl) {
        this.stats.domVerified++;
        return {
          verified: true,
          confidence: 0.95,
          method: "dom_click_url_change",
          details: { previousUrl, newUrl: data.url },
          conclusive: true,
        };
      }

      // Modal wurde geöffnet → Click war erfolgreich
      if (data.modalsOpen > 0) {
        this.stats.domVerified++;
        return {
          verified: true,
          confidence: 0.85,
          method: "dom_click_modal",
          details: { modalsOpen: data.modalsOpen },
          conclusive: true,
        };
      }

      // Keine sichtbare Änderung — inconclusive
      this.stats.inconclusive++;
      return {
        verified: false,
        confidence: 0.4,
        method: "dom_click_no_change",
        details: { url: data.url, bodyLength: data.bodyLength },
        conclusive: false,
      };
    } catch {
      this.stats.inconclusive++;
      return { verified: false, confidence: 0, method: "dom_click_error", details: {}, conclusive: false };
    }
  }

  /**
   * Verifiziert ob Text korrekt eingegeben wurde.
   */
  async verifyType(
    session: BrowserSession,
    url: string,
    selector: string,
    expectedText: string,
  ): Promise<DomVerification> {
    this.stats.total++;

    const script = `
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { found: false };

      const value = el.value || el.textContent || '';
      const validationErrors = [];

      // Suche nach Validierungsfehlern in der Nähe
      const parent = el.closest('div, fieldset, form') || el.parentElement;
      if (parent) {
        const errors = parent.querySelectorAll('.error, .invalid, [class*="error"], [class*="invalid"], [aria-invalid="true"]');
        for (const e of errors) {
          validationErrors.push(e.textContent?.trim().slice(0, 200) || '');
        }
      }

      return {
        found: true,
        value: value,
        hasValidationErrors: validationErrors.length > 0,
        validationErrors: validationErrors.slice(0, 3),
      };
    `;

    try {
      const result = await executeScript(session, url, script);
      if (!result.success) {
        this.stats.inconclusive++;
        return { verified: false, confidence: 0, method: "dom_type", details: {}, conclusive: false };
      }

      const data = result.result as {
        found: boolean;
        value?: string;
        hasValidationErrors?: boolean;
        validationErrors?: string[];
      };

      if (!data.found) {
        this.stats.domVerified++;
        return {
          verified: false,
          confidence: 0.9,
          method: "dom_type_not_found",
          details: { selector },
          conclusive: true,
        };
      }

      // Wert stimmt überein
      if (data.value === expectedText) {
        this.stats.domVerified++;
        return {
          verified: true,
          confidence: data.hasValidationErrors ? 0.7 : 0.95,
          method: data.hasValidationErrors ? "dom_type_match_with_errors" : "dom_type_match",
          details: {
            value: data.value,
            validationErrors: data.validationErrors,
          },
          conclusive: true,
        };
      }

      // Wert stimmt nicht überein
      this.stats.domVerified++;
      return {
        verified: false,
        confidence: 0.9,
        method: "dom_type_mismatch",
        details: {
          expected: expectedText,
          actual: data.value,
          validationErrors: data.validationErrors,
        },
        conclusive: true,
      };
    } catch {
      this.stats.inconclusive++;
      return { verified: false, confidence: 0, method: "dom_type_error", details: {}, conclusive: false };
    }
  }

  /**
   * Verifiziert extrahierte Daten auf Plausibilität.
   * Kein Browser nötig — arbeitet nur auf den Daten.
   */
  verifyDataExtraction(
    data: Record<string, unknown>,
    fields: string[],
  ): DomVerification {
    this.stats.total++;
    const issues: string[] = [];

    // Check: Daten sind nicht leer
    if (Object.keys(data).length === 0) {
      this.stats.domVerified++;
      return {
        verified: false,
        confidence: 0.95,
        method: "data_empty",
        details: { issues: ["Keine Daten extrahiert"] },
        conclusive: true,
      };
    }

    // Check: angeforderte Felder vorhanden
    for (const field of fields) {
      if (data[field] === null || data[field] === undefined) {
        issues.push(`Feld "${field}" nicht gefunden`);
      }
    }

    // Check: Preis-Plausibilität
    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase().includes("price") || key.toLowerCase().includes("preis")) {
        const numVal = typeof value === "string" ? parseFloat(value.replace(/[^0-9.,]/g, "").replace(",", ".")) : Number(value);
        if (isNaN(numVal) || numVal <= 0 || numVal > 1_000_000) {
          issues.push(`Preis "${key}" unplausibel: ${value}`);
        }
      }
    }

    const hasUsefulData = fields.some(f => data[f] !== null && data[f] !== undefined);

    this.stats.domVerified++;
    return {
      verified: hasUsefulData && issues.length === 0,
      confidence: issues.length === 0 ? 0.9 : 0.6,
      method: "data_plausibility",
      details: { issues, fieldsFound: fields.filter(f => data[f] != null).length, fieldsTotal: fields.length },
      conclusive: true,
    };
  }

  /** Gibt Statistiken zurück */
  getStats(): { domVerified: number; inconclusive: number; total: number; savedPercent: number } {
    return {
      ...this.stats,
      savedPercent: this.stats.total > 0 ? Math.round((this.stats.domVerified / this.stats.total) * 100) : 0,
    };
  }
}
