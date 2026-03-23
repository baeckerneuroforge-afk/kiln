/**
 * Multi-Strategy Action Executor
 * Führt Browser-Aktionen mit automatischem Fallback zwischen Strategien aus.
 * Jede Aktion hat mehrere Ausführungswege — der zuverlässigste wird zuerst versucht.
 */

import type { BrowserSession } from "@/lib/browser-service";
import {
  clickElement as browserClickElement,
  typeText as browserTypeText,
  scrollPage as browserScrollPage,
  navigateTo as browserNavigate,
  executeScript,
} from "@/lib/browser-service";
import { ElementFinder, type ElementActionResult } from "./element-finder";
import { safeFetch } from "@/lib/url-validation";

/* ── Types ── */

export interface ActionResult {
  success: boolean;
  result?: unknown;
  methodUsed: string;
  alternativesTried: string[];
  timeMs: number;
  newUrl?: string;
  error?: string;
}

/* ── Constants ── */

const HUMAN_DELAY_MIN_MS = 150;
const HUMAN_DELAY_MAX_MS = 400;

/** Kleine zufällige Pause um menschlich zu wirken */
function humanDelay(): Promise<void> {
  const ms = HUMAN_DELAY_MIN_MS + Math.random() * (HUMAN_DELAY_MAX_MS - HUMAN_DELAY_MIN_MS);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ── Action Executor ── */

export class ActionExecutor {
  private elementFinder: ElementFinder;
  private actionLog: Array<{ action: string; method: string; success: boolean; timeMs: number }> = [];

  constructor(elementFinder?: ElementFinder) {
    this.elementFinder = elementFinder || new ElementFinder();
  }

  /**
   * Klickt auf ein Element mit mehreren Fallback-Strategien.
   */
  async executeClick(
    session: BrowserSession,
    url: string,
    selector: string,
    html?: string,
  ): Promise<ActionResult> {
    const start = Date.now();
    const tried: string[] = [];

    await humanDelay();

    // Strategie 1: ElementFinder (semantic/CSS/XPath — kein Screenshot nötig)
    try {
      tried.push("element_finder");
      const efResult: ElementActionResult = await this.elementFinder.clickElement(session, url, selector, html);
      if (efResult.success) {
        return this.logResult("click", start, {
          success: true,
          methodUsed: "element_finder:" + efResult.method,
          alternativesTried: tried,
        });
      }
    } catch { /* weiter zur nächsten Strategie */ }

    // Strategie 2: Direkte CSS-Selector-Click via Browserless API
    try {
      tried.push("browserless_click");
      const clickResult = await browserClickElement(session, url, selector);
      if (clickResult.success) {
        return this.logResult("click", start, {
          success: true,
          methodUsed: "browserless_click",
          alternativesTried: tried,
          newUrl: clickResult.newUrl,
        });
      }
    } catch { /* weiter */ }

    // Strategie 3: JavaScript click via evaluate
    try {
      tried.push("js_click");
      const jsResult = await executeScript(session, url, `
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { success: false };
        el.click();
        return { success: true, url: window.location.href };
      `);
      if (jsResult.success) {
        const data = jsResult.result as { success: boolean; url?: string } | null;
        if (data?.success) {
          return this.logResult("click", start, {
            success: true,
            methodUsed: "js_click",
            alternativesTried: tried,
            newUrl: data.url,
          });
        }
      }
    } catch { /* weiter */ }

    // Strategie 4: Keyboard-Navigation (Tab + Enter)
    try {
      tried.push("keyboard_nav");
      const kbResult = await executeScript(session, url, `
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { success: false };
        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        return { success: true };
      `);
      if (kbResult.success && (kbResult.result as { success: boolean } | null)?.success) {
        return this.logResult("click", start, {
          success: true,
          methodUsed: "keyboard_nav",
          alternativesTried: tried,
        });
      }
    } catch { /* weiter */ }

    return this.logResult("click", start, {
      success: false,
      methodUsed: "none",
      alternativesTried: tried,
      error: `Alle ${tried.length} Klick-Strategien fehlgeschlagen für: ${selector}`,
    });
  }

  /**
   * Tippt Text mit mehreren Fallback-Strategien.
   */
  async executeType(
    session: BrowserSession,
    url: string,
    selector: string,
    text: string,
    html?: string,
  ): Promise<ActionResult> {
    const start = Date.now();
    const tried: string[] = [];

    await humanDelay();

    // Strategie 1: ElementFinder-basiertes Typing
    try {
      tried.push("element_finder");
      const efResult = await this.elementFinder.typeIntoElement(session, url, selector, text, html);
      if (efResult.success) {
        return this.logResult("type", start, {
          success: true,
          methodUsed: "element_finder:" + efResult.method,
          alternativesTried: tried,
        });
      }
    } catch { /* weiter */ }

    // Strategie 2: Browserless typeText API
    try {
      tried.push("browserless_type");
      const typeResult = await browserTypeText(session, url, selector, text);
      if (typeResult.success) {
        return this.logResult("type", start, {
          success: true,
          methodUsed: "browserless_type",
          alternativesTried: tried,
        });
      }
    } catch { /* weiter */ }

    // Strategie 3: JavaScript value assignment + input events
    try {
      tried.push("js_value_set");
      const jsResult = await executeScript(session, url, `
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { success: false };
        el.focus();
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, value: el.value };
      `);
      if (jsResult.success) {
        const data = jsResult.result as { success: boolean; value?: string } | null;
        if (data?.success && data.value === text) {
          return this.logResult("type", start, {
            success: true,
            methodUsed: "js_value_set",
            alternativesTried: tried,
          });
        }
      }
    } catch { /* weiter */ }

    return this.logResult("type", start, {
      success: false,
      methodUsed: "none",
      alternativesTried: tried,
      error: `Alle ${tried.length} Type-Strategien fehlgeschlagen für: ${selector}`,
    });
  }

  /**
   * Navigiert zu einer URL mit Fallback-Strategien.
   */
  async executeNavigate(
    session: BrowserSession,
    url: string,
  ): Promise<ActionResult> {
    const start = Date.now();
    const tried: string[] = [];

    // Strategie 1: Direkte Navigation via Browserless
    try {
      tried.push("browserless_navigate");
      const result = await browserNavigate(session, url, { timeout: 15000 });
      if (result.content) {
        return this.logResult("navigate", start, {
          success: true,
          result: { contentLength: result.content.length, hasScreenshot: !!result.screenshot },
          methodUsed: "browserless_navigate",
          alternativesTried: tried,
        });
      }
    } catch { /* weiter */ }

    // Strategie 2: Navigation mit längerem Timeout
    try {
      tried.push("browserless_long_timeout");
      const result = await browserNavigate(session, url, { timeout: 30000 });
      if (result.content) {
        return this.logResult("navigate", start, {
          success: true,
          result: { contentLength: result.content.length },
          methodUsed: "browserless_long_timeout",
          alternativesTried: tried,
        });
      }
    } catch { /* weiter */ }

    // Strategie 3: HTTP Fetch als Backup (für Content-Extraktion)
    try {
      tried.push("http_fetch");
      const response = await safeFetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
        },
      });
      if (response.ok) {
        const content = await response.text();
        return this.logResult("navigate", start, {
          success: true,
          result: { contentLength: content.length, httpFallback: true },
          methodUsed: "http_fetch",
          alternativesTried: tried,
        });
      }
    } catch { /* weiter */ }

    return this.logResult("navigate", start, {
      success: false,
      methodUsed: "none",
      alternativesTried: tried,
      error: `Navigation zu ${url} fehlgeschlagen nach ${tried.length} Strategien`,
    });
  }

  /**
   * Extrahiert Daten — bevorzugt DOM-basiert (kein Vision nötig).
   */
  async executeExtract(
    session: BrowserSession,
    url: string,
    fields: string[],
    html?: string,
  ): Promise<ActionResult> {
    const start = Date.now();
    const tried: string[] = [];

    // Strategie 1: DOM-Extraktion via JavaScript (schnellste, günstigste)
    try {
      tried.push("dom_extract");
      const fieldExtractionScript = `
        const fields = ${JSON.stringify(fields)};
        const result = {};

        // JSON-LD suchen
        const jsonLd = document.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
          try {
            const ld = JSON.parse(jsonLd.textContent || '');
            result._jsonLd = ld;
          } catch {}
        }

        // Meta-Tags
        const metas = document.querySelectorAll('meta[property], meta[name]');
        const metaData = {};
        for (const m of metas) {
          const key = m.getAttribute('property') || m.getAttribute('name') || '';
          metaData[key] = m.getAttribute('content') || '';
        }
        if (Object.keys(metaData).length > 0) result._meta = metaData;

        // Text-basierte Extraktion für jedes Feld
        const text = document.body?.innerText || '';
        for (const field of fields) {
          const lower = field.toLowerCase();
          // Regex: "Feldname: Wert" oder "Feldname Wert"
          const regex = new RegExp(lower + '[:\\\\s]+([^\\\\n]+)', 'i');
          const match = text.match(regex);
          result[field] = match ? match[1].trim().slice(0, 500) : null;
        }

        // Tabellen extrahieren
        const tables = document.querySelectorAll('table');
        if (tables.length > 0 && tables.length <= 5) {
          result._tables = Array.from(tables).map(t => {
            const rows = Array.from(t.querySelectorAll('tr')).slice(0, 50);
            return rows.map(r => Array.from(r.querySelectorAll('td, th')).map(c => c.textContent?.trim() || ''));
          });
        }

        return result;
      `;

      const result = await executeScript(session, url, fieldExtractionScript);
      if (result.success && result.result) {
        const data = result.result as Record<string, unknown>;
        // Prüfe ob wir mindestens ein nicht-null Feld haben
        const hasData = fields.some(f => data[f] !== null && data[f] !== undefined);
        if (hasData || data._jsonLd || data._tables) {
          return this.logResult("extract", start, {
            success: true,
            result: data,
            methodUsed: "dom_extract",
            alternativesTried: tried,
          });
        }
      }
    } catch { /* weiter */ }

    // Strategie 2: HTML-Text-Extraktion (wenn DOM-Script fehlschlägt)
    if (html) {
      tried.push("html_text_extract");
      const extracted: Record<string, unknown> = {};
      const textContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");

      for (const field of fields) {
        const regex = new RegExp(`${field.toLowerCase()}[:\\s]+([^\\n.]+)`, "i");
        const match = textContent.match(regex);
        extracted[field] = match ? match[1].trim().slice(0, 500) : null;
      }

      const hasData = fields.some(f => extracted[f] !== null);
      if (hasData) {
        return this.logResult("extract", start, {
          success: true,
          result: extracted,
          methodUsed: "html_text_extract",
          alternativesTried: tried,
        });
      }
    }

    return this.logResult("extract", start, {
      success: false,
      methodUsed: "none",
      alternativesTried: tried,
      error: "Keine Daten extrahiert",
    });
  }

  /** Scrollt die Seite */
  async executeScroll(
    session: BrowserSession,
    url: string,
    direction: "up" | "down",
    pixels: number,
  ): Promise<ActionResult> {
    const start = Date.now();
    await humanDelay();
    const result = await browserScrollPage(session, url, direction, pixels);
    return this.logResult("scroll", start, {
      success: result.success,
      methodUsed: "browserless_scroll",
      alternativesTried: ["browserless_scroll"],
    });
  }

  /** Gibt den Action-Log zurück */
  getLog(): typeof this.actionLog {
    return [...this.actionLog];
  }

  /** Statistiken über Methoden-Nutzung */
  getStats(): { totalActions: number; firstTrySuccess: number; fallbackSuccess: number; failed: number } {
    let firstTry = 0;
    let fallback = 0;
    let failed = 0;
    for (const entry of this.actionLog) {
      if (!entry.success) failed++;
      else if (entry.method.includes("element_finder") || entry.method === "browserless_navigate") firstTry++;
      else fallback++;
    }
    return { totalActions: this.actionLog.length, firstTrySuccess: firstTry, fallbackSuccess: fallback, failed };
  }

  private logResult(action: string, start: number, result: Omit<ActionResult, "timeMs">): ActionResult {
    const timeMs = Date.now() - start;
    this.actionLog.push({
      action,
      method: result.methodUsed,
      success: result.success,
      timeMs,
    });
    return { ...result, timeMs };
  }
}
