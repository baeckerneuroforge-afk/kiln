/**
 * Evidence Collector — Provenance chain for every extracted data point.
 * Each value is traceable to: URL + CSS selector + raw text + extraction method.
 */

/* ── Types ── */

export interface EvidenceSource {
  url: string;
  timestamp: string;
  /** CSS selector used for extraction (null for Vision/regex) */
  selector: string | null;
  /** Raw text from the DOM element (before any cleaning) */
  rawText: string | null;
  /** Human-readable context (page title, surrounding text) */
  context: string;
  /** Which screenshot step shows this data */
  screenshotStep: number | null;
  /** How the data was extracted */
  extractionMethod: "json_ld" | "microdata" | "css_selector" | "dom_regex" | "table" | "vision" | "recipe";
  /** Additional confidence detail for Vision extraction */
  visionConfidence?: number;
}

export interface EvidenceEntry {
  field: string;
  value: string;
  source: EvidenceSource;
  confidence: number;
}

export interface EvidenceChain {
  entries: EvidenceEntry[];
  qualityScore: number; // 0-1, weighted average of confidence
  totalFields: number;
  verifiedFields: number; // Fields with confidence > 0.9
}

/* ── Confidence Weights ── */

const METHOD_CONFIDENCE: Record<EvidenceSource["extractionMethod"], number> = {
  json_ld: 0.97,
  microdata: 0.95,
  css_selector: 0.93,
  recipe: 0.95,
  table: 0.80,
  dom_regex: 0.65,
  vision: 0.75,
};

/* ── Evidence Collector ── */

export class EvidenceCollector {
  private entries: EvidenceEntry[] = [];
  private currentStepIndex = 0;

  setCurrentStep(step: number): void {
    this.currentStepIndex = step;
  }

  /**
   * Records evidence for extracted data from a SmartExtractor result.
   */
  recordExtraction(
    data: Record<string, unknown>,
    method: EvidenceSource["extractionMethod"],
    url: string,
    context: string,
    selectors?: Record<string, string>,
  ): void {
    const timestamp = new Date().toISOString();

    for (const [field, value] of Object.entries(data)) {
      if (field.startsWith("_") || value === undefined || value === null) continue;
      const strValue = typeof value === "object" ? JSON.stringify(value) : String(value);
      if (strValue.length === 0) continue;

      // Don't add duplicates for the same field from the same URL with better or equal confidence
      const existing = this.entries.find((e) => e.field === field && e.source.url === url);
      const newConfidence = METHOD_CONFIDENCE[method] ?? 0.5;
      if (existing && existing.confidence >= newConfidence) continue;

      // Remove lower-confidence duplicate
      if (existing) {
        this.entries = this.entries.filter((e) => e !== existing);
      }

      this.entries.push({
        field,
        value: strValue.slice(0, 500),
        source: {
          url,
          timestamp,
          selector: selectors?.[field] ?? null,
          rawText: strValue.slice(0, 300),
          context: context.slice(0, 200),
          screenshotStep: this.currentStepIndex,
          extractionMethod: method,
        },
        confidence: newConfidence,
      });
    }
  }

  /**
   * Records evidence from a site recipe extraction.
   */
  recordRecipeExtraction(
    data: Record<string, unknown>,
    url: string,
    recipeDomain: string,
    productSelectors?: Record<string, string>,
  ): void {
    this.recordExtraction(
      data,
      "recipe",
      url,
      `Recipe extraction from ${recipeDomain}`,
      productSelectors,
    );
  }

  /**
   * Records evidence from Vision (lower confidence, no selector).
   */
  recordVisionExtraction(
    data: Record<string, unknown>,
    url: string,
    visionConfidence: number,
  ): void {
    const timestamp = new Date().toISOString();
    for (const [field, value] of Object.entries(data)) {
      if (field.startsWith("_") || value === undefined || value === null) continue;
      const strValue = typeof value === "object" ? JSON.stringify(value) : String(value);
      if (strValue.length === 0) continue;

      const existing = this.entries.find((e) => e.field === field);
      const effectiveConfidence = Math.min(visionConfidence, METHOD_CONFIDENCE.vision);
      if (existing && existing.confidence >= effectiveConfidence) continue;

      if (existing) {
        this.entries = this.entries.filter((e) => e !== existing);
      }

      this.entries.push({
        field,
        value: strValue.slice(0, 500),
        source: {
          url,
          timestamp,
          selector: null,
          rawText: null,
          context: `Vision extraction at step ${this.currentStepIndex}`,
          screenshotStep: this.currentStepIndex,
          extractionMethod: "vision",
          visionConfidence,
        },
        confidence: effectiveConfidence,
      });
    }
  }

  /**
   * Returns the complete evidence chain.
   */
  getChain(): EvidenceChain {
    const totalFields = this.entries.length;
    if (totalFields === 0) {
      return { entries: [], qualityScore: 0, totalFields: 0, verifiedFields: 0 };
    }

    const qualityScore = this.entries.reduce((sum, e) => sum + e.confidence, 0) / totalFields;
    const verifiedFields = this.entries.filter((e) => e.confidence >= 0.9).length;

    return {
      entries: [...this.entries],
      qualityScore,
      totalFields,
      verifiedFields,
    };
  }

  /**
   * Returns evidence for a specific field.
   */
  getEvidenceForField(field: string): EvidenceEntry | undefined {
    return this.entries.find((e) => e.field === field);
  }

  /**
   * Builds compact source metadata for the result.
   * Keeps only the most important fields to avoid bloating the response.
   */
  buildSourceMetadata(): Array<{
    field: string;
    value: string;
    url: string;
    method: string;
    confidence: number;
    selector: string | null;
  }> {
    return this.entries.map((e) => ({
      field: e.field,
      value: e.value.slice(0, 200),
      url: e.source.url,
      method: e.source.extractionMethod,
      confidence: Math.round(e.confidence * 100) / 100,
      selector: e.source.selector,
    }));
  }

  /**
   * Builds human-readable source lines for the result summary.
   */
  buildSourceLines(): string[] {
    const byUrl = new Map<string, EvidenceEntry[]>();
    for (const entry of this.entries) {
      const existing = byUrl.get(entry.source.url) || [];
      existing.push(entry);
      byUrl.set(entry.source.url, existing);
    }

    const lines: string[] = [];
    let idx = 1;
    for (const [url, entries] of byUrl) {
      const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
      const fields = entries.map((e) => e.field).join(", ");
      const avgConf = Math.round((entries.reduce((s, e) => s + e.confidence, 0) / entries.length) * 100);
      const method = entries[0].source.extractionMethod;
      lines.push(`[${idx}] ${domain} — ${fields} extracted via ${method} (confidence: ${avgConf}%)`);
      idx++;
    }

    return lines;
  }
}
