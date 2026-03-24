/**
 * Pattern 2: Page Understanding
 * Analysiert Seitentyp und Struktur günstig über DOM-Analyse.
 * Nur bei Bedarf wird Haiku für visuelle Analyse verwendet.
 * Kostet 0 Credits für DOM-Analyse, ~0.5 Credits für Haiku-Fallback.
 */

import type { BrowserSession } from "@/lib/browser-service";
import { executeScript } from "@/lib/browser-service";
import type { PageStructure } from "./page-cache";

/* ── Types ── */

export type PageType =
  | "search_results"
  | "product_detail"
  | "product_listing"
  | "login_page"
  | "form_page"
  | "article"
  | "dashboard"
  | "error_page"
  | "landing_page"
  | "checkout"
  | "unknown";

export interface PageAnalysis {
  pageType: PageType;
  structure: PageStructure;
  /** Ob die Seite interaktive Elemente hat die Vision brauchen */
  needsVision: boolean;
  /** Ob Daten direkt aus dem DOM extrahiert werden können */
  canExtractFromDom: boolean;
  /** Erkannte Hindernisse (Cookie-Banner, Popups, etc.) */
  obstacles: ObstacleDetection[];
  /** Konfidenz der Analyse (0-1) */
  confidence: number;
  /** Methode der Analyse */
  method: "dom" | "haiku";
}

export interface ObstacleDetection {
  type: "cookie_banner" | "popup" | "overlay" | "captcha" | "login_wall" | "paywall";
  selector?: string;
  confidence: number;
}

/* ── DOM Analysis Script ── */

const DOM_ANALYSIS_SCRIPT = `
return (function() {
  const body = document.body;
  if (!body) return null;

  const text = body.innerText || '';
  const html = body.innerHTML || '';
  const lowerText = text.toLowerCase();
  const lowerHtml = html.toLowerCase();

  // Seitentyp-Signale
  const signals = {
    hasSearchInput: !!document.querySelector('input[type="search"], input[name*="search"], input[name*="query"], input[placeholder*="search" i], input[placeholder*="suche" i]'),
    hasSearchResults: !!(document.querySelector('[class*="search-result"], [class*="searchResult"], [data-testid*="search"]') || document.querySelectorAll('[class*="result-item"], .search-results li').length > 2),
    hasProductPrice: !!(document.querySelector('[class*="price"], [data-price], [itemprop="price"]') || /\\$\\d|€\\d|\\d+[.,]\\d{2}\\s*(?:€|\\$|USD|EUR)/i.test(text)),
    hasProductGrid: document.querySelectorAll('[class*="product-card"], [class*="productCard"], [class*="product-item"], [class*="productItem"]').length > 2,
    hasLoginForm: !!(document.querySelector('input[type="password"]') && document.querySelector('input[type="email"], input[type="text"], input[name*="user"]')),
    hasForms: document.querySelectorAll('form').length,
    hasFormFields: document.querySelectorAll('input:not([type="hidden"]):not([type="search"]), select, textarea').length,
    hasArticleContent: !!(document.querySelector('article, [class*="article"], [class*="post-content"], [class*="blog-content"]') || document.querySelector('main')?.querySelectorAll('p').length > 3),
    hasDashboardWidgets: document.querySelectorAll('[class*="widget"], [class*="card"], [class*="panel"], [class*="stat"]').length > 3,
    hasError: !!(document.querySelector('[class*="error"], [class*="404"], [class*="not-found"]') || /404|not found|error/i.test(document.title || '')),
    hasCheckout: !!(document.querySelector('[class*="checkout"], [class*="cart"], [class*="payment"]') || /checkout|warenkorb|kasse|payment/i.test(lowerText)),

    // Hindernisse
    hasCookieBanner: !!(document.querySelector('[class*="cookie"], [class*="consent"], [id*="cookie"], [id*="consent"], [class*="gdpr"]')),
    hasOverlay: !!(document.querySelector('[class*="modal"][style*="display"], [class*="overlay"][style*="display"], [class*="popup"]:not([style*="none"])')),
    hasPaywall: /paywall|subscribe to read|premium content|sign up to continue/i.test(lowerText),

    // Struktur
    title: (document.title || '').slice(0, 120),
    url: window.location.href,
    formCount: document.querySelectorAll('form').length,
    linkCount: document.querySelectorAll('a[href]').length,
    imageCount: document.querySelectorAll('img').length,
    tableCount: document.querySelectorAll('table').length,
    contentLength: text.length,
  };

  // Strukturierte Daten sammeln
  const forms = [];
  for (const form of document.querySelectorAll('form').values()) {
    const fields = [];
    for (const input of form.querySelectorAll('input:not([type="hidden"]), select, textarea').values()) {
      const name = input.getAttribute('name') || input.getAttribute('id') || input.getAttribute('placeholder') || '';
      if (name) fields.push(name);
    }
    if (fields.length > 0) {
      forms.push({ selector: form.getAttribute('id') ? '#' + form.getAttribute('id') : 'form', fields });
    }
  }

  const buttons = [];
  for (const btn of document.querySelectorAll('button, [type="submit"], [role="button"]').values()) {
    const text = (btn.textContent || '').trim().slice(0, 60);
    if (text && text.length > 1) {
      const id = btn.getAttribute('id');
      buttons.push({ selector: id ? '#' + id : btn.tagName.toLowerCase(), text });
    }
  }

  const prices = [];
  for (const el of document.querySelectorAll('[class*="price"], [data-price], [itemprop="price"]').values()) {
    const text = (el.textContent || '').trim().slice(0, 40);
    if (text) {
      const cls = el.getAttribute('class') || '';
      prices.push({ selector: '.' + cls.split(' ')[0], text });
    }
  }

  const links = [];
  const navLinks = document.querySelectorAll('nav a, header a, [class*="nav"] a');
  for (const a of navLinks.values()) {
    const text = (a.textContent || '').trim().slice(0, 40);
    const href = a.getAttribute('href') || '';
    if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      links.push({ selector: 'a', text, href });
    }
  }

  const searchField = document.querySelector('input[type="search"], input[name*="search"], input[name*="query"], input[placeholder*="search" i]');
  const searchSelector = searchField ? (searchField.getAttribute('id') ? '#' + searchField.getAttribute('id') : 'input[type="search"]') : undefined;

  // Cookie-Banner Selektoren
  const cookieSelectors = [];
  const cookieElements = document.querySelectorAll('[class*="cookie"], [class*="consent"], [id*="cookie"], [id*="consent"]');
  for (const el of cookieElements.values()) {
    const acceptBtn = el.querySelector('button[class*="accept"], button[class*="agree"], button[class*="allow"], [class*="accept"], [class*="agree"]');
    if (acceptBtn) {
      const id = acceptBtn.getAttribute('id');
      cookieSelectors.push(id ? '#' + id : '.cookie-accept');
    }
  }

  return {
    signals,
    structure: {
      forms: forms.slice(0, 5),
      buttons: buttons.slice(0, 10),
      links: links.slice(0, 15),
      tables: signals.tableCount,
      prices: prices.slice(0, 10),
      navigation: links.slice(0, 10),
      searchField: searchSelector,
      loginForm: signals.hasLoginForm,
    },
    cookieSelectors: cookieSelectors.slice(0, 3),
  };
})();
`;

/* ── Page Analyzer ── */

export class PageAnalyzer {
  private analysisCache = new Map<string, PageAnalysis>();
  private stats = { domAnalyses: 0, haikuAnalyses: 0, cacheHits: 0 };

  /**
   * Analysiert eine Seite primär über DOM-Analyse (0 Credits).
   * Fällt nur bei niedriger Konfidenz auf Haiku zurück.
   */
  async analyzePage(
    session: BrowserSession,
    url: string,
  ): Promise<PageAnalysis> {
    // Cache Check
    const cacheKey = this.urlToKey(url);
    const cached = this.analysisCache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    // DOM-Analyse (kostenlos)
    const domResult = await this.analyzeDom(session, url);
    if (domResult && domResult.confidence >= 0.6) {
      this.analysisCache.set(cacheKey, domResult);
      return domResult;
    }

    // Fallback: DOM-Analyse mit niedrigerer Konfidenz
    if (domResult) {
      this.analysisCache.set(cacheKey, domResult);
      return domResult;
    }

    // Letzter Fallback: unbekannte Seite
    const fallback: PageAnalysis = {
      pageType: "unknown",
      structure: {
        forms: [],
        buttons: [],
        links: [],
        tables: 0,
        prices: [],
        navigation: [],
      },
      needsVision: true,
      canExtractFromDom: false,
      obstacles: [],
      confidence: 0.1,
      method: "dom",
    };
    this.analysisCache.set(cacheKey, fallback);
    return fallback;
  }

  /**
   * DOM-basierte Seitenanalyse. Kostet 0 Credits.
   */
  private async analyzeDom(session: BrowserSession, url: string): Promise<PageAnalysis | null> {
    this.stats.domAnalyses++;

    try {
      const execResult = await executeScript(session, url, DOM_ANALYSIS_SCRIPT);
      if (!execResult.success || !execResult.result) return null;

      const data = execResult.result as {
        signals: Record<string, unknown>;
        structure: PageStructure;
        cookieSelectors: string[];
      };

      const signals = data.signals;
      const pageType = this.classifyPageType(signals);
      const obstacles = this.detectObstacles(signals, data.cookieSelectors);

      // Bestimme ob Vision nötig ist
      const needsVision =
        pageType === "unknown" ||
        (pageType === "product_detail" && !data.structure.prices.length) ||
        obstacles.some((o) => o.type === "captcha");

      // Bestimme ob DOM-Extraktion möglich ist
      const canExtractFromDom =
        data.structure.prices.length > 0 ||
        data.structure.forms.length > 0 ||
        (Number(signals.tableCount) || 0) > 0 ||
        (Number(signals.contentLength) || 0) > 500;

      return {
        pageType,
        structure: data.structure,
        needsVision,
        canExtractFromDom,
        obstacles,
        confidence: pageType === "unknown" ? 0.3 : 0.8,
        method: "dom",
      };
    } catch {
      return null;
    }
  }

  /**
   * Klassifiziert den Seitentyp basierend auf DOM-Signalen.
   */
  private classifyPageType(signals: Record<string, unknown>): PageType {
    if (signals.hasError) return "error_page";
    if (signals.hasCheckout) return "checkout";
    if (signals.hasLoginForm) return "login_page";
    if (signals.hasSearchResults) return "search_results";
    if (signals.hasProductPrice && !signals.hasProductGrid) return "product_detail";
    if (signals.hasProductGrid) return "product_listing";
    if (signals.hasArticleContent) return "article";
    if (signals.hasDashboardWidgets) return "dashboard";
    if ((Number(signals.hasForms) || 0) > 0 && (Number(signals.hasFormFields) || 0) > 3) return "form_page";

    const linkCount = Number(signals.linkCount) || 0;
    const imageCount = Number(signals.imageCount) || 0;
    if (linkCount > 15 && imageCount > 3) return "landing_page";

    return "unknown";
  }

  /**
   * Erkennt Hindernisse auf der Seite.
   */
  private detectObstacles(
    signals: Record<string, unknown>,
    cookieSelectors: string[],
  ): ObstacleDetection[] {
    const obstacles: ObstacleDetection[] = [];

    if (signals.hasCookieBanner) {
      obstacles.push({
        type: "cookie_banner",
        selector: cookieSelectors[0],
        confidence: 0.9,
      });
    }

    if (signals.hasOverlay) {
      obstacles.push({
        type: "overlay",
        confidence: 0.7,
      });
    }

    if (signals.hasPaywall) {
      obstacles.push({
        type: "paywall",
        confidence: 0.8,
      });
    }

    if (signals.hasLoginForm) {
      // Nur als Hindernis wenn es nicht der Task-Zweck ist
      obstacles.push({
        type: "login_wall",
        confidence: 0.5,
      });
    }

    return obstacles;
  }

  /**
   * Gibt die Seitenstruktur als Prompt-Hint zurück.
   */
  analysisToPromptHint(analysis: PageAnalysis): string {
    const hints: string[] = [
      `Seitentyp: ${analysis.pageType} (Konfidenz: ${Math.round(analysis.confidence * 100)}%)`,
    ];

    if (analysis.canExtractFromDom) {
      hints.push("Daten können direkt aus DOM extrahiert werden (kein Vision nötig).");
    }

    if (analysis.obstacles.length > 0) {
      const obstacleTypes = analysis.obstacles.map((o) => o.type).join(", ");
      hints.push(`Hindernisse erkannt: ${obstacleTypes}`);
    }

    if (analysis.structure.searchField) {
      hints.push(`Suchfeld: ${analysis.structure.searchField}`);
    }

    if (analysis.structure.prices.length > 0) {
      hints.push(`${analysis.structure.prices.length} Preis-Elemente gefunden`);
    }

    if (analysis.structure.forms.length > 0) {
      hints.push(`${analysis.structure.forms.length} Formular(e) gefunden`);
    }

    return hints.join("\n");
  }

  /** Statistiken */
  getStats(): { domAnalyses: number; haikuAnalyses: number; cacheHits: number } {
    return { ...this.stats };
  }

  /** Cache leeren */
  clearCache(): void {
    this.analysisCache.clear();
  }

  private urlToKey(url: string): string {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname.replace(/\/\d+/g, "/:id").replace(/\/$/, "") || "/"}`;
    } catch {
      return url;
    }
  }
}
