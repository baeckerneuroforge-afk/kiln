/**
 * Page Understanding Cache
 * Cached Seiten-Strukturanalysen um wiederholte Vision-Aufrufe zu vermeiden.
 * Arbeitet auf Domain + Pfad-Pattern-Ebene (nicht exakte URL).
 */

/* ── Types ── */

export interface PageStructure {
  forms: Array<{ selector: string; fields: string[] }>;
  buttons: Array<{ selector: string; text: string }>;
  links: Array<{ selector: string; text: string; href: string }>;
  tables: number;
  prices: Array<{ selector: string; text: string }>;
  navigation: Array<{ selector: string; text: string }>;
  searchField?: string;
  loginForm?: boolean;
}

interface CacheEntry {
  structure: PageStructure;
  cachedAt: number;
  hits: number;
}

/* ── Constants ── */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 Stunden
const MAX_CACHE_SIZE = 200;

/* ── Page Cache ── */

export class PageCache {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /**
   * Normalisiert eine URL zu einem Cache-Key.
   * /products/123 und /products/456 → same pattern
   */
  private urlToPattern(url: string): string {
    try {
      const u = new URL(url);
      // IDs und Zahlen im Pfad durch Platzhalter ersetzen
      const normalizedPath = u.pathname
        .replace(/\/\d+/g, "/:id")           // /123 → /:id
        .replace(/\/[a-f0-9]{24,}/gi, "/:id") // MongoDB ObjectIds
        .replace(/\/[a-z0-9-]{36}/gi, "/:id") // UUIDs
        .replace(/\/$/, "");                   // Trailing slash entfernen

      return `${u.hostname}${normalizedPath || "/"}`;
    } catch {
      return url;
    }
  }

  /**
   * Speichert eine Seiten-Struktur im Cache.
   */
  cachePage(url: string, structure: PageStructure): void {
    const pattern = this.urlToPattern(url);

    // LRU-Eviction wenn Cache voll
    if (this.cache.size >= MAX_CACHE_SIZE) {
      let oldest: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of this.cache) {
        if (entry.cachedAt < oldestTime) {
          oldestTime = entry.cachedAt;
          oldest = key;
        }
      }
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.set(pattern, {
      structure,
      cachedAt: Date.now(),
      hits: 0,
    });
  }

  /**
   * Gibt die gecachte Struktur zurück oder null bei Cache-Miss.
   */
  getCachedStructure(url: string): PageStructure | null {
    const pattern = this.urlToPattern(url);
    const entry = this.cache.get(pattern);
    if (!entry) return null;

    // TTL prüfen
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(pattern);
      return null;
    }

    entry.hits++;
    return entry.structure;
  }

  /**
   * Generiert einen Prompt-Hint aus gecachter Struktur.
   */
  structureToPromptHint(structure: PageStructure): string {
    const hints: string[] = [];

    if (structure.searchField) {
      hints.push(`Search field: ${structure.searchField}`);
    }
    if (structure.forms.length > 0) {
      for (const form of structure.forms.slice(0, 3)) {
        hints.push(`Form at "${form.selector}" with fields: ${form.fields.join(", ")}`);
      }
    }
    if (structure.buttons.length > 0) {
      hints.push(`Buttons: ${structure.buttons.slice(0, 5).map(b => `"${b.text}" (${b.selector})`).join(", ")}`);
    }
    if (structure.prices.length > 0) {
      hints.push(`Prices found at: ${structure.prices.slice(0, 3).map(p => p.selector).join(", ")}`);
    }
    if (structure.loginForm) {
      hints.push("Login form detected on this page");
    }

    if (hints.length === 0) return "";

    return `\n\nKnown page elements (from previous visits):\n${hints.join("\n")}`;
  }

  /**
   * Importiert Seiten-Strukturen aus ProceduralMemory-Steps.
   */
  updateFromProceduralSteps(url: string, steps: Array<{ selector?: string; action: string }>): void {
    const existing = this.getCachedStructure(url) || {
      forms: [],
      buttons: [],
      links: [],
      tables: 0,
      prices: [],
      navigation: [],
    };

    for (const step of steps) {
      if (!step.selector) continue;

      if (step.action === "click" || step.action === "click_link") {
        if (!existing.buttons.some(b => b.selector === step.selector)) {
          existing.buttons.push({ selector: step.selector, text: step.selector });
        }
      }
      if (step.action === "type" && step.selector) {
        const sel = step.selector;
        const formIdx = existing.forms.findIndex(f => f.fields.includes(sel));
        if (formIdx === -1) {
          existing.forms.push({ selector: "form", fields: [sel] });
        }
      }
    }

    this.cachePage(url, existing);
  }

  /** Cache-Statistiken */
  getStats(): { size: number; maxSize: number } {
    return { size: this.cache.size, maxSize: MAX_CACHE_SIZE };
  }

  /** Cache leeren */
  clear(): void {
    this.cache.clear();
  }
}
