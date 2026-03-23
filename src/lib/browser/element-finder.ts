/**
 * Element Finder — HTML-First Element Targeting
 * Findet Elemente auf einer Seite über mehrere Strategien,
 * bevor auf teure Vision-basierte Koordinaten-Suche zurückgegriffen wird.
 */

import type { BrowserSession } from "@/lib/browser-service";
import { executeScript } from "@/lib/browser-service";

/* ── Types ── */

export interface ElementMatch {
  selector?: string;
  xpath?: string;
  x?: number;
  y?: number;
  method: "semantic" | "css" | "xpath" | "vision";
  confidence: number;
  elementText?: string;
}

export interface ElementActionResult {
  success: boolean;
  method: string;
  confidence: number;
  error?: string;
}

/* ── Element Finder ── */

export class ElementFinder {
  private stats = { semantic: 0, css: 0, xpath: 0, vision: 0, total: 0 };

  /**
   * Findet ein Element auf der Seite über multiple Strategien.
   * Versucht: 1) Semantic HTML 2) CSS Selectors 3) XPath 4) Vision (falls callback)
   */
  async findElement(
    session: BrowserSession,
    url: string,
    description: string,
    html?: string,
  ): Promise<ElementMatch | null> {
    this.stats.total++;

    // Strategie 1: Semantic HTML — text content, aria-label, placeholder, title
    const semantic = await this.findBySemantic(session, url, description);
    if (semantic) {
      this.stats.semantic++;
      return semantic;
    }

    // Strategie 2: CSS Selectors — id, class, name, data attributes
    const css = this.findByCSS(description, html);
    if (css) {
      this.stats.css++;
      return css;
    }

    // Strategie 3: XPath — construct from description text
    const xpath = await this.findByXPath(session, url, description);
    if (xpath) {
      this.stats.xpath++;
      return xpath;
    }

    // Strategie 4: Vision Fallback — nur wenn Strategien 1-3 versagen
    // (wird vom Aufrufer gehandhabt — wir geben null zurück)
    return null;
  }

  /**
   * Findet Element über semantische HTML-Attribute:
   * textContent, aria-label, placeholder, title, alt
   */
  private async findBySemantic(
    session: BrowserSession,
    url: string,
    description: string,
  ): Promise<ElementMatch | null> {
    const descLower = description.toLowerCase().trim();

    // JavaScript im Browser ausführen um Elemente zu finden
    const script = `
      const desc = ${JSON.stringify(descLower)};
      const interactive = document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"], [onclick], label');
      let best = null;
      let bestScore = 0;

      for (const el of interactive) {
        let score = 0;
        const text = (el.textContent || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        const alt = (el.getAttribute('alt') || '').toLowerCase();
        const value = (el.getAttribute('value') || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();

        // Exakter Match
        if (text === desc || aria === desc || placeholder === desc || title === desc || value === desc) {
          score = 100;
        }
        // Enthält den Text
        else if (text.includes(desc) || aria.includes(desc)) {
          score = 85;
        }
        // Placeholder/title/name Match
        else if (placeholder.includes(desc) || title.includes(desc) || name.includes(desc)) {
          score = 80;
        }
        // Alt-Text Match (für Bilder in Links/Buttons)
        else if (alt.includes(desc)) {
          score = 75;
        }
        // Partieller Wort-Overlap
        else {
          const descWords = desc.split(/\\s+/);
          const allText = [text, aria, placeholder, title, name].join(' ');
          const matchedWords = descWords.filter(w => allText.includes(w));
          if (matchedWords.length > 0) {
            score = Math.min(70, 30 + matchedWords.length * 15);
          }
        }

        // Kürzerer Text = spezifischer = besser (bei gleichem Score)
        if (score > bestScore || (score === bestScore && best && text.length < best.text.length)) {
          // Unique selector generieren
          let selector = '';
          if (el.id) {
            selector = '#' + CSS.escape(el.id);
          } else if (el.getAttribute('data-testid')) {
            selector = '[data-testid="' + el.getAttribute('data-testid') + '"]';
          } else if (el.getAttribute('name')) {
            selector = el.tagName.toLowerCase() + '[name="' + el.getAttribute('name') + '"]';
          } else if (el.getAttribute('aria-label')) {
            selector = '[aria-label="' + el.getAttribute('aria-label') + '"]';
          } else if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\\s+/).slice(0, 3).map(c => '.' + CSS.escape(c)).join('');
            selector = el.tagName.toLowerCase() + classes;
          } else {
            // nth-child fallback
            const parent = el.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children);
              const idx = siblings.indexOf(el) + 1;
              selector = el.tagName.toLowerCase() + ':nth-child(' + idx + ')';
            } else {
              selector = el.tagName.toLowerCase();
            }
          }

          bestScore = score;
          best = { selector, text: text.slice(0, 100), score };
        }
      }

      return best;
    `;

    try {
      const result = await executeScript(session, url, script);
      if (result.success && result.result) {
        const match = result.result as { selector: string; text: string; score: number };
        if (match.score >= 50) {
          return {
            selector: match.selector,
            method: "semantic",
            confidence: Math.min(0.95, match.score / 100),
            elementText: match.text,
          };
        }
      }
    } catch {
      // Semantic search fehlgeschlagen — nächste Strategie
    }

    return null;
  }

  /**
   * Findet Element über CSS-Selektoren aus der Beschreibung.
   * Parst HTML nach IDs, Klassen, Namen die zur Beschreibung passen.
   */
  private findByCSS(description: string, html?: string): ElementMatch | null {
    if (!html) return null;

    const descLower = description.toLowerCase().trim();
    const keywords = descLower.split(/\s+/).filter(w => w.length > 2);

    // Suche nach ID-Attributen
    for (const keyword of keywords) {
      const idRegex = new RegExp(`id=["']([^"']*${keyword}[^"']*)["']`, "i");
      const idMatch = html.match(idRegex);
      if (idMatch) {
        return {
          selector: `#${idMatch[1]}`,
          method: "css",
          confidence: 0.90,
        };
      }
    }

    // Suche nach name-Attributen bei Inputs
    for (const keyword of keywords) {
      const nameRegex = new RegExp(
        `<(?:input|select|textarea)[^>]*name=["']([^"']*${keyword}[^"']*)["']`,
        "i"
      );
      const nameMatch = html.match(nameRegex);
      if (nameMatch) {
        return {
          selector: `[name="${nameMatch[1]}"]`,
          method: "css",
          confidence: 0.90,
        };
      }
    }

    // Suche nach data-testid
    for (const keyword of keywords) {
      const testIdRegex = new RegExp(`data-testid=["']([^"']*${keyword}[^"']*)["']`, "i");
      const testIdMatch = html.match(testIdRegex);
      if (testIdMatch) {
        return {
          selector: `[data-testid="${testIdMatch[1]}"]`,
          method: "css",
          confidence: 0.92,
        };
      }
    }

    return null;
  }

  /**
   * Findet Element über XPath-Ausdrücke.
   */
  private async findByXPath(
    session: BrowserSession,
    url: string,
    description: string,
  ): Promise<ElementMatch | null> {
    const descLower = description.toLowerCase().trim();

    // Generiere XPath-Kandidaten
    const xpaths = [
      `//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${descLower}')]`,
      `//a[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${descLower}')]`,
      `//input[@placeholder[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${descLower}')]]`,
      `//*[@aria-label[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${descLower}')]]`,
      `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${descLower}')]`,
    ];

    const script = `
      const xpaths = ${JSON.stringify(xpaths)};
      for (const xpath of xpaths) {
        try {
          const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          if (result.singleNodeValue) {
            const el = result.singleNodeValue;
            return {
              xpath: xpath,
              text: (el.textContent || '').trim().slice(0, 100),
              tag: el.nodeName.toLowerCase(),
            };
          }
        } catch (e) { /* Ungültiger XPath — weiter */ }
      }
      return null;
    `;

    try {
      const result = await executeScript(session, url, script);
      if (result.success && result.result) {
        const match = result.result as { xpath: string; text: string; tag: string };
        return {
          xpath: match.xpath,
          method: "xpath",
          confidence: 0.85,
          elementText: match.text,
        };
      }
    } catch {
      // XPath fehlgeschlagen
    }

    return null;
  }

  /**
   * Klickt auf ein Element über die beste verfügbare Strategie.
   */
  async clickElement(
    session: BrowserSession,
    url: string,
    description: string,
    html?: string,
  ): Promise<ElementActionResult> {
    const match = await this.findElement(session, url, description, html);
    if (!match) {
      return { success: false, method: "none", confidence: 0, error: "Element nicht gefunden" };
    }

    // CSS Selector click
    if (match.selector) {
      const script = `
        const el = document.querySelector(${JSON.stringify(match.selector)});
        if (!el) return { success: false, error: 'Element nicht im DOM' };
        el.click();
        return { success: true, newUrl: window.location.href };
      `;
      const result = await executeScript(session, url, script);
      if (result.success) {
        const data = result.result as { success: boolean } | null;
        if (data?.success) {
          return { success: true, method: match.method, confidence: match.confidence };
        }
      }

      // Fallback: JavaScript dispatchEvent
      const fallbackScript = `
        const el = document.querySelector(${JSON.stringify(match.selector)});
        if (!el) return { success: false };
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return { success: true };
      `;
      const fallback = await executeScript(session, url, fallbackScript);
      if (fallback.success && (fallback.result as { success: boolean } | null)?.success) {
        return { success: true, method: match.method + "+dispatch", confidence: match.confidence * 0.9 };
      }
    }

    // XPath click
    if (match.xpath) {
      const script = `
        const result = document.evaluate(${JSON.stringify(match.xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const el = result.singleNodeValue;
        if (!el) return { success: false };
        el.click();
        return { success: true };
      `;
      const result = await executeScript(session, url, script);
      if (result.success && (result.result as { success: boolean } | null)?.success) {
        return { success: true, method: "xpath", confidence: match.confidence };
      }
    }

    return { success: false, method: match.method, confidence: match.confidence, error: "Click ausführen fehlgeschlagen" };
  }

  /**
   * Tippt Text in ein Element.
   */
  async typeIntoElement(
    session: BrowserSession,
    url: string,
    description: string,
    text: string,
    html?: string,
  ): Promise<ElementActionResult> {
    const match = await this.findElement(session, url, description, html);
    if (!match) {
      return { success: false, method: "none", confidence: 0, error: "Input nicht gefunden" };
    }

    if (match.selector) {
      // Strategie 1: Focus + Input Events
      const script = `
        const el = document.querySelector(${JSON.stringify(match.selector)});
        if (!el) return { success: false, error: 'Element nicht im DOM' };
        el.focus();
        el.value = '';
        const text = ${JSON.stringify(text)};
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, value: el.value };
      `;
      const result = await executeScript(session, url, script);
      if (result.success) {
        const data = result.result as { success: boolean; value?: string } | null;
        if (data?.success && data.value === text) {
          return { success: true, method: match.method, confidence: match.confidence };
        }
      }
    }

    return { success: false, method: match.method || "none", confidence: 0, error: "Typing fehlgeschlagen" };
  }

  /** Gibt die bisherigen Strategie-Statistiken zurück */
  getStats(): { semantic: number; css: number; xpath: number; vision: number; total: number } {
    return { ...this.stats };
  }
}
