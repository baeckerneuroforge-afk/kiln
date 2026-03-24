/**
 * Pattern 5: Multi-Strategy Navigation
 * Mehrere Navigations-Strategien mit automatischem Fallback.
 * Jede URL-Änderung hat einen Backup-Plan.
 */

import type { BrowserSession } from "@/lib/browser-service";
import {
  navigateTo as browserNavigate,
  getCurrentBrowserUrl,
  getPageContent as getBrowserPageContent,
  executeScript,
} from "@/lib/browser-service";
import { safeFetch } from "@/lib/url-validation";

/* ── Types ── */

export interface NavigationResult {
  success: boolean;
  finalUrl: string;
  content: string;
  method: NavigationMethod;
  timeMs: number;
  /** Ob die Navigation eine Weiterleitung ausgelöst hat */
  redirected: boolean;
  error?: string;
}

export type NavigationMethod =
  | "direct"
  | "url_construction"
  | "search_engine"
  | "site_search"
  | "link_following"
  | "http_fallback";

export interface NavigationPlan {
  strategies: Array<{
    method: NavigationMethod;
    url: string;
    reasoning: string;
  }>;
}

/* ── Constants ── */

const NAVIGATION_TIMEOUT_MS = 30_000;

/* ── Navigation Strategies ── */

export class NavigationStrategies {
  private stats = {
    direct: 0,
    urlConstruction: 0,
    searchEngine: 0,
    siteSearch: 0,
    linkFollowing: 0,
    httpFallback: 0,
    failures: 0,
  };

  /**
   * Navigiert zu einer URL mit automatischem Fallback.
   * Versucht Strategien in Reihenfolge: direkt → URL-Konstruktion → Fallback.
   */
  async navigateWithFallback(
    session: BrowserSession,
    targetUrl: string,
    currentUrl: string,
  ): Promise<NavigationResult> {
    const start = Date.now();

    // Strategie 1: Direkte Navigation
    const directResult = await this.navigateDirect(session, targetUrl);
    if (directResult.success && !this.isErrorPage(directResult.content)) {
      this.stats.direct++;
      return { ...directResult, timeMs: Date.now() - start };
    }

    // Strategie 2: URL-Konstruktion (relative URLs auflösen)
    const constructedUrl = this.constructUrl(targetUrl, currentUrl);
    if (constructedUrl !== targetUrl) {
      const constructedResult = await this.navigateDirect(session, constructedUrl);
      if (constructedResult.success && !this.isErrorPage(constructedResult.content)) {
        this.stats.urlConstruction++;
        return {
          ...constructedResult,
          method: "url_construction",
          timeMs: Date.now() - start,
        };
      }
    }

    // Strategie 3: HTTP-Fallback (für Seiten die im Browser nicht laden)
    try {
      const httpResult = await this.navigateViaHttp(targetUrl);
      if (httpResult.success) {
        this.stats.httpFallback++;
        return { ...httpResult, timeMs: Date.now() - start };
      }
    } catch {
      // Ignorieren — bereits Fallback
    }

    this.stats.failures++;
    return {
      success: false,
      finalUrl: currentUrl,
      content: "",
      method: "direct",
      timeMs: Date.now() - start,
      redirected: false,
      error: `Navigation zu ${targetUrl} fehlgeschlagen nach allen Strategien`,
    };
  }

  /**
   * Plant Navigations-Strategien für eine Aufgabe.
   * Gibt eine priorisierte Liste von URLs/Methoden zurück.
   */
  planNavigation(
    task: string,
    targetDescription: string,
    currentUrl: string,
    siteDomain?: string,
  ): NavigationPlan {
    const strategies: NavigationPlan["strategies"] = [];

    // Direkte URL wenn vorhanden
    const urlMatch = targetDescription.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      strategies.push({
        method: "direct",
        url: urlMatch[0],
        reasoning: "Direkte URL aus Beschreibung",
      });
    }

    // URL-Konstruktion basierend auf Beschreibung
    if (siteDomain) {
      const slug = targetDescription
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      strategies.push({
        method: "url_construction",
        url: `https://${siteDomain}/${slug}`,
        reasoning: `URL-Konstruktion: /${slug}`,
      });

      // Bekannte Patterns
      const commonPaths: Record<string, string[]> = {
        pricing: ["/pricing", "/plans", "/preise"],
        contact: ["/contact", "/kontakt", "/contact-us"],
        about: ["/about", "/about-us", "/ueber-uns"],
        login: ["/login", "/signin", "/sign-in", "/anmelden"],
        search: ["/search", "/suche"],
        products: ["/products", "/produkte", "/shop"],
        blog: ["/blog", "/news", "/artikel"],
        faq: ["/faq", "/help", "/hilfe"],
      };

      const targetLower = targetDescription.toLowerCase();
      for (const [keyword, paths] of Object.entries(commonPaths)) {
        if (targetLower.includes(keyword)) {
          for (const path of paths) {
            strategies.push({
              method: "url_construction",
              url: `https://${siteDomain}${path}`,
              reasoning: `Bekanntes Pattern: ${keyword} → ${path}`,
            });
          }
          break;
        }
      }
    }

    // Site-Suche als Fallback
    if (siteDomain) {
      strategies.push({
        method: "site_search",
        url: `https://${siteDomain}/search?q=${encodeURIComponent(targetDescription)}`,
        reasoning: "Site-Suche als Fallback",
      });
    }

    // Google-Suche als letzter Fallback
    strategies.push({
      method: "search_engine",
      url: `https://www.google.com/search?q=${encodeURIComponent(`${targetDescription} site:${siteDomain || ""}`)}`,
      reasoning: "Google-Suche als letzter Fallback",
    });

    return { strategies };
  }

  /**
   * Folgt einem Link auf der aktuellen Seite per Text-Match.
   */
  async followLink(
    session: BrowserSession,
    linkText: string,
    currentUrl: string,
  ): Promise<NavigationResult> {
    const start = Date.now();

    try {
      const execResult = await executeScript(
        session,
        currentUrl,
        `
        return (function() {
          const target = ${JSON.stringify(linkText.toLowerCase())};
          const links = document.querySelectorAll('a[href]');

          // Exakte Text-Matches
          for (const a of links) {
            const text = (a.textContent || '').trim().toLowerCase();
            if (text === target) {
              return { href: a.href, text, method: 'exact' };
            }
          }

          // Partial Matches
          for (const a of links) {
            const text = (a.textContent || '').trim().toLowerCase();
            if (text.includes(target) || target.includes(text)) {
              return { href: a.href, text, method: 'partial' };
            }
          }

          // aria-label Matches
          for (const a of links) {
            const label = (a.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes(target)) {
              return { href: a.href, text: label, method: 'aria' };
            }
          }

          return null;
        })();
        `,
      );

      const linkData = execResult.result as { href: string; text: string; method: string } | null;
      if (!linkData?.href) {
        this.stats.failures++;
        return {
          success: false,
          finalUrl: currentUrl,
          content: "",
          method: "link_following",
          timeMs: Date.now() - start,
          redirected: false,
          error: `Link "${linkText}" nicht gefunden`,
        };
      }

      // Navigiere zum gefundenen Link
      const navResult = await this.navigateDirect(session, linkData.href);
      this.stats.linkFollowing++;

      return {
        ...navResult,
        method: "link_following",
        timeMs: Date.now() - start,
      };
    } catch (error) {
      this.stats.failures++;
      return {
        success: false,
        finalUrl: currentUrl,
        content: "",
        method: "link_following",
        timeMs: Date.now() - start,
        redirected: false,
        error: error instanceof Error ? error.message : "Link-Follow fehlgeschlagen",
      };
    }
  }

  /** Statistiken */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /* ── Private Methods ── */

  private async navigateDirect(
    session: BrowserSession,
    url: string,
  ): Promise<NavigationResult> {
    try {
      const result = await browserNavigate(session, url, {
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      const finalUrl = await getCurrentBrowserUrl(session).catch(() => url);
      const content = await getBrowserPageContent(session, finalUrl).catch(
        () => result.content || "",
      );

      return {
        success: true,
        finalUrl,
        content,
        method: "direct",
        timeMs: 0,
        redirected: finalUrl !== url,
      };
    } catch (error) {
      return {
        success: false,
        finalUrl: url,
        content: "",
        method: "direct",
        timeMs: 0,
        redirected: false,
        error: error instanceof Error ? error.message : "Navigation fehlgeschlagen",
      };
    }
  }

  private async navigateViaHttp(url: string): Promise<NavigationResult> {
    try {
      const response = await safeFetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          finalUrl: url,
          content: "",
          method: "http_fallback",
          timeMs: 0,
          redirected: false,
          error: `HTTP ${response.status}`,
        };
      }

      const html = await response.text();
      return {
        success: true,
        finalUrl: response.url || url,
        content: html.slice(0, 50000),
        method: "http_fallback",
        timeMs: 0,
        redirected: (response.url || url) !== url,
      };
    } catch (error) {
      return {
        success: false,
        finalUrl: url,
        content: "",
        method: "http_fallback",
        timeMs: 0,
        redirected: false,
        error: error instanceof Error ? error.message : "HTTP-Fallback fehlgeschlagen",
      };
    }
  }

  private constructUrl(target: string, base: string): string {
    try {
      return new URL(target, base).href;
    } catch {
      return target;
    }
  }

  private isErrorPage(content: string): boolean {
    if (!content || content.length < 100) return true;
    const lower = content.toLowerCase();
    return (
      lower.includes("404") &&
      (lower.includes("not found") || lower.includes("page not found"))
    ) || (
      lower.includes("403") && lower.includes("forbidden")
    ) || (
      lower.includes("500") && lower.includes("server error")
    );
  }
}
