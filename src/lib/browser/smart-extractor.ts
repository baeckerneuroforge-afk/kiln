/**
 * Pattern 4: Smart Data Extraction
 * Cheapest-first Datenextraktion: Structured Data → DOM → Haiku → Vision.
 * Jede Stufe wird nur versucht wenn die vorherige nicht genügt.
 */

import type { BrowserSession } from "@/lib/browser-service";
import { executeScript } from "@/lib/browser-service";

/* ── Types ── */

export interface ExtractionResult {
  data: Record<string, unknown>;
  method: "structured_data" | "dom_regex" | "dom_selectors" | "haiku" | "vision";
  confidence: number;
  creditsCost: number;
  fieldsFound: string[];
  fieldsMissing: string[];
}

export interface ExtractionRequest {
  fields: string[];
  /** Optionale CSS-Selektoren aus Page-Cache */
  knownSelectors?: Record<string, string>;
  /** Ob alle Felder gefunden werden müssen */
  requireAll?: boolean;
}

/* ── DOM Extraction Scripts ── */

/**
 * Extrahiert strukturierte Daten (JSON-LD, Microdata, Meta-Tags).
 * Kostet 0 Credits.
 */
const STRUCTURED_DATA_SCRIPT = `
return (function() {
  const result = {};

  // JSON-LD (Schema.org)
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  const jsonLd = [];
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      jsonLd.push(data);
    } catch { /* ignore */ }
  }
  if (jsonLd.length > 0) result._jsonLd = jsonLd;

  // Microdata (itemprop)
  const microdata = {};
  for (const el of document.querySelectorAll('[itemprop]')) {
    const prop = el.getAttribute('itemprop');
    const value = el.getAttribute('content') || el.textContent?.trim() || '';
    if (prop && value) microdata[prop] = value.slice(0, 500);
  }
  if (Object.keys(microdata).length > 0) result._microdata = microdata;

  // Open Graph
  const og = {};
  for (const meta of document.querySelectorAll('meta[property^="og:"]')) {
    const prop = meta.getAttribute('property')?.replace('og:', '') || '';
    const content = meta.getAttribute('content') || '';
    if (prop && content) og[prop] = content;
  }
  if (Object.keys(og).length > 0) result._openGraph = og;

  // Preis-spezifische Daten
  const priceEl = document.querySelector('[itemprop="price"], [data-price], [class*="price"]:not([class*="old-price"]):not([class*="was-price"])');
  if (priceEl) {
    result.price = priceEl.getAttribute('content') || priceEl.textContent?.trim() || '';
  }

  const currencyEl = document.querySelector('[itemprop="priceCurrency"]');
  if (currencyEl) {
    result.currency = currencyEl.getAttribute('content') || currencyEl.textContent?.trim() || '';
  }

  // Titel
  result.title = document.querySelector('h1')?.textContent?.trim()?.slice(0, 200) || document.title || '';

  // Beschreibung
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) result.description = descMeta.getAttribute('content') || '';

  return result;
})();
`;

/**
 * Extrahiert Daten über CSS-Selektoren (bekannt aus Page-Cache).
 */
function buildSelectorExtractionScript(selectors: Record<string, string>): string {
  const selectorEntries = Object.entries(selectors)
    .map(([field, selector]) => `"${field}": "${selector.replace(/"/g, '\\"')}"`)
    .join(", ");

  return `
return (function() {
  const selectors = {${selectorEntries}};
  const result = {};
  for (const [field, selector] of Object.entries(selectors)) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        result[field] = (el.getAttribute('content') || el.textContent || '').trim().slice(0, 1000);
      }
    } catch { /* ignore */ }
  }
  return result;
})();
`;
}

/**
 * Extrahiert Daten über Text-Pattern-Matching aus dem DOM.
 */
function buildRegexExtractionScript(fields: string[]): string {
  const fieldPatterns = fields
    .map((f) => {
      const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return `"${f}": new RegExp("(?:${escaped})[:\\\\s]+([^\\\\n.]{1,500})", "i")`;
    })
    .join(",\n    ");

  return `
return (function() {
  const text = (document.body?.innerText || '').slice(0, 50000);
  const patterns = {
    ${fieldPatterns}
  };
  const result = {};
  for (const [field, regex] of Object.entries(patterns)) {
    const match = text.match(regex);
    if (match) result[field] = match[1].trim();
  }
  return result;
})();
`;
}

/**
 * Extrahiert Tabellendaten aus dem DOM.
 */
const TABLE_EXTRACTION_SCRIPT = `
return (function() {
  const tables = document.querySelectorAll('table');
  if (tables.length === 0) return null;

  const result = [];
  for (const table of tables) {
    const rows = [];
    const headers = [];

    // Header
    for (const th of table.querySelectorAll('thead th, thead td, tr:first-child th')) {
      headers.push((th.textContent || '').trim());
    }

    // Body
    const bodyRows = table.querySelectorAll('tbody tr, tr');
    for (const tr of bodyRows) {
      const cells = [];
      for (const td of tr.querySelectorAll('td, th')) {
        cells.push((td.textContent || '').trim().slice(0, 200));
      }
      if (cells.length > 0 && cells.some(c => c.length > 0)) {
        rows.push(cells);
      }
    }

    if (rows.length > 0) {
      result.push({ headers, rows: rows.slice(0, 50) });
    }
  }

  return result.length > 0 ? result : null;
})();
`;

/* ── Smart Extractor ── */

export class SmartExtractor {
  private stats = {
    structuredData: 0,
    domRegex: 0,
    domSelectors: 0,
    haiku: 0,
    vision: 0,
    totalCredits: 0,
  };

  /**
   * Extrahiert Daten mit der günstigsten Methode zuerst.
   * Steigt nur bei Bedarf zu teureren Methoden auf.
   */
  async extract(
    session: BrowserSession,
    request: ExtractionRequest,
    url?: string,
  ): Promise<ExtractionResult> {
    const pageUrl = url || "about:blank";
    const { fields, knownSelectors, requireAll = false } = request;

    // Stufe 1: Strukturierte Daten (JSON-LD, Microdata, Meta) — 0 Credits
    const structured = await this.extractStructuredData(session, pageUrl, fields);
    if (this.isComplete(structured, fields, requireAll)) {
      return structured;
    }

    // Stufe 2: Bekannte CSS-Selektoren (aus Page-Cache) — 0 Credits
    if (knownSelectors && Object.keys(knownSelectors).length > 0) {
      const selectorResult = await this.extractBySelectors(session, pageUrl, fields, knownSelectors);
      const merged = this.mergeResults(structured, selectorResult);
      if (this.isComplete(merged, fields, requireAll)) {
        return merged;
      }
    }

    // Stufe 3: DOM Text-Pattern-Matching — 0 Credits
    const missingAfterStructured = fields.filter(
      (f) => !structured.data[f] && !(knownSelectors && structured.data[f]),
    );
    if (missingAfterStructured.length > 0) {
      const regexResult = await this.extractByRegex(session, pageUrl, missingAfterStructured);
      const merged = this.mergeResults(structured, regexResult);
      if (this.isComplete(merged, fields, requireAll)) {
        return merged;
      }
    }

    // Stufe 4: Tabellen-Extraktion — 0 Credits
    const tableResult = await this.extractFromTables(session, pageUrl, fields);
    if (tableResult) {
      const merged = this.mergeResults(structured, tableResult);
      if (this.isComplete(merged, fields, requireAll)) {
        return merged;
      }
    }

    // Alle DOM-Ergebnisse zusammenführen und zurückgeben
    // (Haiku/Vision wird vom Hauptloop bei Bedarf aufgerufen)
    const allDomResults = this.mergeResults(
      structured,
      tableResult || structured,
    );

    return allDomResults;
  }

  /**
   * Stufe 1: Strukturierte Daten extrahieren (JSON-LD, Microdata, Meta).
   */
  async extractStructuredData(
    session: BrowserSession,
    url: string,
    fields: string[],
  ): Promise<ExtractionResult> {
    this.stats.structuredData++;

    try {
      const execResult = await executeScript(session, url, STRUCTURED_DATA_SCRIPT);
      const raw = execResult.result as Record<string, unknown> | null;
      if (!raw) return this.emptyResult("structured_data", fields);

      // Map rohe Daten auf gewünschte Felder
      const data = this.mapToFields(raw, fields);

      const fieldsFound = fields.filter((f) => data[f] !== undefined && data[f] !== null);
      const fieldsMissing = fields.filter((f) => data[f] === undefined || data[f] === null);

      return {
        data,
        method: "structured_data",
        confidence: fieldsFound.length > 0 ? 0.95 : 0,
        creditsCost: 0,
        fieldsFound,
        fieldsMissing,
      };
    } catch {
      return this.emptyResult("structured_data", fields);
    }
  }

  /**
   * Stufe 2: Extraktion über bekannte CSS-Selektoren.
   */
  async extractBySelectors(
    session: BrowserSession,
    url: string,
    fields: string[],
    selectors: Record<string, string>,
  ): Promise<ExtractionResult> {
    this.stats.domSelectors++;

    try {
      const script = buildSelectorExtractionScript(selectors);
      const execResult = await executeScript(session, url, script);
      const raw = execResult.result as Record<string, string> | null;
      if (!raw) return this.emptyResult("dom_selectors", fields);

      const data: Record<string, unknown> = {};
      for (const field of fields) {
        if (raw[field]) data[field] = raw[field];
      }

      const fieldsFound = fields.filter((f) => data[f] !== undefined);
      return {
        data,
        method: "dom_selectors",
        confidence: fieldsFound.length > 0 ? 0.85 : 0,
        creditsCost: 0,
        fieldsFound,
        fieldsMissing: fields.filter((f) => !data[f]),
      };
    } catch {
      return this.emptyResult("dom_selectors", fields);
    }
  }

  /**
   * Stufe 3: Extraktion über Text-Pattern-Matching.
   */
  async extractByRegex(
    session: BrowserSession,
    url: string,
    fields: string[],
  ): Promise<ExtractionResult> {
    this.stats.domRegex++;

    try {
      const script = buildRegexExtractionScript(fields);
      const execResult = await executeScript(session, url, script);
      const raw = execResult.result as Record<string, string> | null;
      if (!raw) return this.emptyResult("dom_regex", fields);

      const fieldsFound = fields.filter((f) => raw[f]);
      return {
        data: raw,
        method: "dom_regex",
        confidence: fieldsFound.length > 0 ? 0.6 : 0,
        creditsCost: 0,
        fieldsFound,
        fieldsMissing: fields.filter((f) => !raw[f]),
      };
    } catch {
      return this.emptyResult("dom_regex", fields);
    }
  }

  /**
   * Stufe 4: Tabellen-Extraktion.
   */
  async extractFromTables(
    session: BrowserSession,
    url: string,
    fields: string[],
  ): Promise<ExtractionResult | null> {
    try {
      const execResult = await executeScript(session, url, TABLE_EXTRACTION_SCRIPT);
      const tables = execResult.result as
        | Array<{ headers: string[]; rows: string[][] }>
        | null;
      if (!tables || tables.length === 0) return null;

      const data: Record<string, unknown> = {};
      data._tables = tables;

      // Versuche Felder in Tabellen-Headers zu matchen
      for (const field of fields) {
        const fieldLower = field.toLowerCase();
        for (const table of tables) {
          const headerIdx = table.headers.findIndex((h) =>
            h.toLowerCase().includes(fieldLower),
          );
          if (headerIdx >= 0 && table.rows.length > 0) {
            data[field] = table.rows[0][headerIdx] || null;
          }
        }
      }

      const fieldsFound = fields.filter((f) => data[f] !== undefined && data[f] !== null);
      if (fieldsFound.length === 0 && !tables.length) return null;

      return {
        data,
        method: "dom_selectors",
        confidence: fieldsFound.length > 0 ? 0.7 : 0.3,
        creditsCost: 0,
        fieldsFound,
        fieldsMissing: fields.filter((f) => !data[f]),
      };
    } catch {
      return null;
    }
  }

  /** Statistiken */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /* ── Private Helpers ── */

  private mapToFields(
    raw: Record<string, unknown>,
    fields: string[],
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    // Direkte Matches
    for (const field of fields) {
      if (raw[field] !== undefined) {
        data[field] = raw[field];
        continue;
      }

      // Suche in JSON-LD
      const jsonLd = raw._jsonLd as Array<Record<string, unknown>> | undefined;
      if (jsonLd) {
        for (const item of jsonLd) {
          if (item[field] !== undefined) {
            data[field] = item[field];
            break;
          }
          // Verschachtelte Suche (z.B. offers.price)
          for (const value of Object.values(item)) {
            if (typeof value === "object" && value !== null && (value as Record<string, unknown>)[field] !== undefined) {
              data[field] = (value as Record<string, unknown>)[field];
              break;
            }
          }
        }
      }

      // Suche in Microdata
      const microdata = raw._microdata as Record<string, string> | undefined;
      if (microdata && microdata[field]) {
        data[field] = microdata[field];
      }

      // Open Graph Fallback
      const og = raw._openGraph as Record<string, string> | undefined;
      if (og && og[field]) {
        data[field] = og[field];
      }
    }

    return data;
  }

  private isComplete(
    result: ExtractionResult,
    fields: string[],
    requireAll: boolean,
  ): boolean {
    if (requireAll) {
      return fields.every((f) => result.data[f] !== undefined && result.data[f] !== null);
    }
    // Mindestens 60% der Felder gefunden
    return result.fieldsFound.length >= Math.ceil(fields.length * 0.6);
  }

  private mergeResults(
    base: ExtractionResult,
    additional: ExtractionResult,
  ): ExtractionResult {
    const data = { ...base.data };
    for (const [key, value] of Object.entries(additional.data)) {
      if (value !== undefined && value !== null && !data[key]) {
        data[key] = value;
      }
    }

    const allFields = [
      ...new Set([...base.fieldsFound, ...base.fieldsMissing]),
    ];
    const fieldsFound = allFields.filter(
      (f) => data[f] !== undefined && data[f] !== null,
    );

    return {
      data,
      method: base.confidence >= additional.confidence ? base.method : additional.method,
      confidence: Math.max(base.confidence, additional.confidence),
      creditsCost: base.creditsCost + additional.creditsCost,
      fieldsFound,
      fieldsMissing: allFields.filter((f) => !fieldsFound.includes(f)),
    };
  }

  private emptyResult(
    method: ExtractionResult["method"],
    fields: string[],
  ): ExtractionResult {
    return {
      data: {},
      method,
      confidence: 0,
      creditsCost: 0,
      fieldsFound: [],
      fieldsMissing: [...fields],
    };
  }

  /* ── Static: HTTP-First Extraction (no browser needed) ── */

  /**
   * Extracts data from raw HTML string without a browser session.
   * Same extraction logic: JSON-LD → Microdata → Meta → Regex.
   * ~200ms, 0 credits, no browser required.
   */
  static extractFromHtml(
    html: string,
    url: string,
    fields: string[],
  ): ExtractionResult {
    const data: Record<string, unknown> = {};

    // 1. JSON-LD (Schema.org) — höchste Confidence
    const jsonLdMatches = html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    const jsonLdItems: Record<string, unknown>[] = [];
    for (const match of jsonLdMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          jsonLdItems.push(...parsed);
        } else {
          jsonLdItems.push(parsed);
        }
      } catch { /* ungültiges JSON */ }
    }

    if (jsonLdItems.length > 0) {
      for (const field of fields) {
        if (data[field] !== undefined) continue;
        for (const item of jsonLdItems) {
          // Direkte Felder
          if (item[field] !== undefined) {
            data[field] = String(item[field]).slice(0, 500);
            break;
          }
          // Name/Titel-Varianten
          if (field === "title" && item.name) {
            data[field] = String(item.name).slice(0, 500);
            break;
          }
          // Verschachtelt: offers.price, offers.priceCurrency
          for (const val of Object.values(item)) {
            if (typeof val === "object" && val !== null) {
              const nested = val as Record<string, unknown>;
              if (nested[field] !== undefined) {
                data[field] = String(nested[field]).slice(0, 500);
                break;
              }
            }
          }
        }
      }
    }

    // 2. Microdata (itemprop)
    const microdataRegex = /<[^>]+itemprop\s*=\s*["']([^"']+)["'][^>]*(?:content\s*=\s*["']([^"']+)["'])?[^>]*>([^<]*)/gi;
    let mdMatch: RegExpExecArray | null;
    while ((mdMatch = microdataRegex.exec(html)) !== null) {
      const prop = mdMatch[1];
      const value = (mdMatch[2] || mdMatch[3] || "").trim();
      if (!value) continue;
      for (const field of fields) {
        if (data[field] !== undefined) continue;
        if (prop.toLowerCase() === field.toLowerCase()) {
          data[field] = value.slice(0, 500);
        }
      }
    }

    // 3. Open Graph meta tags
    const ogRegex = /<meta[^>]+property\s*=\s*["']og:([^"']+)["'][^>]+content\s*=\s*["']([^"']+)["']/gi;
    let ogMatch: RegExpExecArray | null;
    while ((ogMatch = ogRegex.exec(html)) !== null) {
      const prop = ogMatch[1];
      const content = ogMatch[2].trim();
      for (const field of fields) {
        if (data[field] !== undefined) continue;
        if (prop.toLowerCase() === field.toLowerCase() || (field === "title" && prop === "title") || (field === "description" && prop === "description") || (field === "image" && prop === "image")) {
          data[field] = content.slice(0, 500);
        }
      }
    }

    // 4. Meta description
    if (!data.description) {
      const descMatch = html.match(/<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["']([^"']+)["']/i);
      if (descMatch && fields.includes("description")) {
        data.description = descMatch[1].trim().slice(0, 500);
      }
    }

    // 5. Title from <h1> or <title>
    if (!data.title && fields.includes("title")) {
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match) {
        data.title = h1Match[1].replace(/<[^>]+>/g, "").trim().slice(0, 200);
      } else {
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch) {
          data.title = titleMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 200);
        }
      }
    }

    // 6. Price extraction from common patterns
    if (!data.price && fields.includes("price")) {
      // itemprop="price" content="..."
      const priceContentMatch = html.match(/<[^>]+itemprop\s*=\s*["']price["'][^>]+content\s*=\s*["']([^"']+)["']/i);
      if (priceContentMatch) {
        data.price = priceContentMatch[1].trim();
      } else {
        // data-price="..."
        const dataPriceMatch = html.match(/data-price\s*=\s*["']([^"']+)["']/i);
        if (dataPriceMatch) {
          data.price = dataPriceMatch[1].trim();
        }
      }
    }

    // 7. Currency
    if (!data.currency && fields.includes("currency")) {
      const currMatch = html.match(/<[^>]+itemprop\s*=\s*["']priceCurrency["'][^>]+content\s*=\s*["']([^"']+)["']/i);
      if (currMatch) {
        data.currency = currMatch[1].trim();
      }
    }

    // 8. Availability
    if (!data.availability && fields.includes("availability")) {
      const availMatch = html.match(/<[^>]+itemprop\s*=\s*["']availability["'][^>]+(?:content|href)\s*=\s*["']([^"']+)["']/i);
      if (availMatch) {
        const val = availMatch[1];
        // Schema.org URLs zu lesbarem Text
        data.availability = val.replace(/^https?:\/\/schema\.org\//, "").trim();
      }
    }

    // 9. Rating
    if (!data.rating && fields.includes("rating")) {
      const ratingMatch = html.match(/<[^>]+itemprop\s*=\s*["']ratingValue["'][^>]+content\s*=\s*["']([^"']+)["']/i);
      if (ratingMatch) {
        data.rating = ratingMatch[1].trim();
      }
    }

    // 10. Brand
    if (!data.brand && fields.includes("brand")) {
      const brandMatch = html.match(/<[^>]+itemprop\s*=\s*["']brand["'][^>]*>[\s\S]*?itemprop\s*=\s*["']name["'][^>]+content\s*=\s*["']([^"']+)["']/i)
        || html.match(/<[^>]+itemprop\s*=\s*["']brand["'][^>]+content\s*=\s*["']([^"']+)["']/i);
      if (brandMatch) {
        data.brand = (brandMatch[1] || brandMatch[2] || "").trim();
      }
    }

    // Ergebnis zusammenstellen
    const fieldsFound = fields.filter((f) => data[f] !== undefined && data[f] !== null && String(data[f]).length > 0);
    const fieldsMissing = fields.filter((f) => !fieldsFound.includes(f));

    // Confidence basiert auf JSON-LD > Microdata > Meta
    const hasJsonLd = jsonLdItems.length > 0 && fieldsFound.length > 0;
    const confidence = hasJsonLd ? 0.95 : fieldsFound.length > 0 ? 0.8 : 0;

    return {
      data,
      method: hasJsonLd ? "structured_data" : "dom_regex",
      confidence,
      creditsCost: 0,
      fieldsFound,
      fieldsMissing,
    };
  }
}
