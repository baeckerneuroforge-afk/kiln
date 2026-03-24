/**
 * Pattern 3: Obstacle Auto-Handler
 * Erkennt und beseitigt Cookie-Banner, Popups, Overlays und andere Hindernisse.
 * Kostet 0 Credits — rein DOM-basiert.
 */

import type { BrowserSession } from "@/lib/browser-service";
import { executeScript } from "@/lib/browser-service";
import type { ObstacleDetection } from "./page-analyzer";

/* ── Types ── */

export interface ObstacleResult {
  handled: boolean;
  type: string;
  method: string;
  selector?: string;
  timeMs: number;
}

/* ── Dismiss Scripts ── */

/**
 * Universelles Cookie-Banner Dismiss Script.
 * Sucht nach bekannten Cookie-Consent-Patterns und klickt "Accept".
 */
const COOKIE_DISMISS_SCRIPT = `
return (function() {
  // Bekannte Cookie-Consent-Manager Selektoren
  const acceptSelectors = [
    // Generische Accept-Buttons
    'button[class*="accept" i]',
    'button[class*="agree" i]',
    'button[class*="allow" i]',
    'button[class*="consent" i]',
    'a[class*="accept" i]',
    '[class*="accept-all" i]',
    '[class*="accept_all" i]',
    '[class*="acceptAll" i]',
    '[data-action="accept"]',
    '[data-testid*="accept" i]',

    // Deutsche Varianten
    'button[class*="akzeptieren" i]',
    'button[class*="zustimmen" i]',
    'button[class*="einverstanden" i]',

    // Bekannte Cookie-Manager
    '#onetrust-accept-btn-handler',
    '.cc-accept',
    '.cc-btn.cc-dismiss',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    '.cmpboxbtn.cmpboxbtnyes',
    '#didomi-notice-agree-button',
    '.fc-cta-consent',
    '#consent_prompt_submit',
    '.js-accept-cookies',
    '#cookie-accept',
    '.cookie-accept-all',
    '#accept-cookies',
    '.accept-cookies-button',
    '[aria-label*="accept" i][aria-label*="cookie" i]',
    '[aria-label*="akzeptieren" i]',
  ];

  // Text-basierte Suche als Fallback
  const acceptTexts = [
    'accept all', 'accept cookies', 'accept', 'agree', 'allow all', 'allow',
    'got it', 'ok', 'i agree', 'i understand', 'continue',
    'alle akzeptieren', 'akzeptieren', 'zustimmen', 'einverstanden',
    'alle cookies akzeptieren', 'cookies akzeptieren',
  ];

  // Versuche Selektor-basiert
  for (const selector of acceptSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        el.click();
        return { success: true, method: 'selector', selector };
      }
    } catch { /* ignore */ }
  }

  // Versuche Text-basiert
  const allButtons = document.querySelectorAll('button, a[role="button"], [class*="btn"], [class*="button"]');
  for (const btn of allButtons) {
    const text = (btn.textContent || '').trim().toLowerCase();
    if (acceptTexts.some(t => text === t || text.includes(t))) {
      if (btn.offsetParent !== null) {
        btn.click();
        return { success: true, method: 'text', selector: text };
      }
    }
  }

  // Letzte Option: Banner direkt ausblenden
  const bannerSelectors = [
    '[class*="cookie-banner"]', '[class*="cookieBanner"]',
    '[class*="cookie-notice"]', '[class*="cookieNotice"]',
    '[class*="consent-banner"]', '[class*="consentBanner"]',
    '[id*="cookie-banner"]', '[id*="cookieBanner"]',
    '#onetrust-banner-sdk', '#CybotCookiebotDialog',
    '.fc-consent-root', '#didomi-popup',
  ];

  for (const selector of bannerSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        el.style.display = 'none';
        return { success: true, method: 'hide', selector };
      }
    } catch { /* ignore */ }
  }

  return { success: false, method: 'none', selector: null };
})();
`;

/**
 * Universelles Popup/Overlay Dismiss Script.
 */
const POPUP_DISMISS_SCRIPT = `
return (function() {
  // Close-Buttons in Overlays/Modals
  const closeSelectors = [
    '[class*="modal"] [class*="close"]',
    '[class*="modal"] button[aria-label*="close" i]',
    '[class*="modal"] button[aria-label*="schließen" i]',
    '[class*="overlay"] [class*="close"]',
    '[class*="popup"] [class*="close"]',
    '[class*="dialog"] [class*="close"]',
    '.modal .close', '.modal-close',
    '[data-dismiss="modal"]',
    '[class*="modal"] .btn-close',
    'button[class*="dismiss"]',
    '[class*="modal"] svg[class*="close"]',
  ];

  for (const selector of closeSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        el.click();
        return { success: true, method: 'close_button', selector };
      }
    } catch { /* ignore */ }
  }

  // ESC-Taste simulieren
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  // Prüfe ob Overlay noch da ist
  const overlays = document.querySelectorAll('[class*="modal"][style*="display: block"], [class*="modal"][class*="show"], [class*="overlay"]:not([style*="display: none"])');
  if (overlays.length > 0) {
    // Overlay per Style ausblenden
    for (const ol of overlays) {
      ol.style.display = 'none';
    }
    // Body Scroll wieder aktivieren
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.documentElement.style.overflow = '';
    return { success: true, method: 'force_hide', selector: 'overlay' };
  }

  return { success: true, method: 'esc_key', selector: null };
})();
`;

/**
 * Newsletter-Popup Dismiss Script.
 */
const NEWSLETTER_DISMISS_SCRIPT = `
return (function() {
  const newsletterSelectors = [
    '[class*="newsletter"] [class*="close"]',
    '[class*="newsletter"] button[aria-label*="close" i]',
    '[class*="subscribe"] [class*="close"]',
    '[class*="popup"] [class*="close"]',
    '[class*="email-capture"] [class*="close"]',
    '[class*="signup-modal"] [class*="close"]',
  ];

  for (const selector of newsletterSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        el.click();
        return { success: true, method: 'close', selector };
      }
    } catch { /* ignore */ }
  }

  // "No thanks" Links
  const noThanksTexts = ['no thanks', 'nein danke', 'nicht jetzt', 'skip', 'maybe later', 'später', 'close'];
  const allLinks = document.querySelectorAll('a, button, span[role="button"]');
  for (const el of allLinks) {
    const text = (el.textContent || '').trim().toLowerCase();
    if (noThanksTexts.some(t => text === t || text.includes(t))) {
      if (el.offsetParent !== null) {
        el.click();
        return { success: true, method: 'no_thanks', selector: text };
      }
    }
  }

  return { success: false, method: 'none', selector: null };
})();
`;

/* ── Obstacle Handler ── */

export class ObstacleHandler {
  private handledObstacles: ObstacleResult[] = [];
  private stats = { cookieBanners: 0, popups: 0, overlays: 0, total: 0 };

  /**
   * Versucht alle erkannten Hindernisse auf der Seite zu beseitigen.
   * Rein DOM-basiert — 0 Credits.
   */
  async handleAllObstacles(
    session: BrowserSession,
    url: string,
    obstacles: ObstacleDetection[],
  ): Promise<ObstacleResult[]> {
    const results: ObstacleResult[] = [];

    for (const obstacle of obstacles) {
      const start = Date.now();
      let result: ObstacleResult;

      switch (obstacle.type) {
        case "cookie_banner":
          result = await this.dismissCookieBanner(session, url, obstacle.selector);
          break;
        case "popup":
        case "overlay":
          result = await this.dismissPopup(session, url);
          break;
        case "login_wall":
          // Login-Walls können nicht automatisch behandelt werden
          result = {
            handled: false,
            type: "login_wall",
            method: "skipped",
            timeMs: 0,
          };
          break;
        case "paywall":
          // Paywalls können nicht automatisch behandelt werden
          result = {
            handled: false,
            type: "paywall",
            method: "skipped",
            timeMs: 0,
          };
          break;
        case "captcha":
          // Captchas können nicht automatisch behandelt werden
          result = {
            handled: false,
            type: "captcha",
            method: "skipped",
            timeMs: 0,
          };
          break;
        default:
          result = {
            handled: false,
            type: obstacle.type,
            method: "unknown",
            timeMs: 0,
          };
      }

      result.timeMs = Date.now() - start;
      results.push(result);
      this.handledObstacles.push(result);
    }

    return results;
  }

  /**
   * Proaktiver Scan: Sucht und beseitigt Hindernisse ohne vorherige Analyse.
   * Nützlich als erster Schritt nach dem Laden einer Seite.
   */
  async proactiveScan(session: BrowserSession, url: string): Promise<ObstacleResult[]> {
    const results: ObstacleResult[] = [];

    // Cookie-Banner immer zuerst versuchen
    const cookieResult = await this.dismissCookieBanner(session, url);
    if (cookieResult.handled) {
      results.push(cookieResult);
      // Kurz warten damit sich die Seite stabilisiert
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Newsletter-Popups
    const newsletterResult = await this.dismissNewsletter(session, url);
    if (newsletterResult.handled) {
      results.push(newsletterResult);
    }

    // Generische Overlays
    const popupResult = await this.dismissPopup(session, url);
    if (popupResult.handled) {
      results.push(popupResult);
    }

    return results;
  }

  /**
   * Versucht ein Cookie-Banner zu schließen.
   */
  async dismissCookieBanner(
    session: BrowserSession,
    url: string,
    knownSelector?: string,
  ): Promise<ObstacleResult> {
    const start = Date.now();
    this.stats.total++;

    // Wenn ein bekannter Selektor vorhanden ist, direkt versuchen
    if (knownSelector) {
      try {
        const clickResult = await executeScript(
          session,
          url,
          `
          const el = document.querySelector('${knownSelector.replace(/'/g, "\\'")}');
          if (el) { el.click(); return true; }
          return false;
          `,
        );
        if (clickResult.success && clickResult.result) {
          this.stats.cookieBanners++;
          return {
            handled: true,
            type: "cookie_banner",
            method: "known_selector",
            selector: knownSelector,
            timeMs: Date.now() - start,
          };
        }
      } catch {
        // Fallthrough zu generischem Script
      }
    }

    // Generisches Cookie-Dismiss-Script
    try {
      const execResult = await executeScript(session, url, COOKIE_DISMISS_SCRIPT);
      const result = execResult.result as {
        success: boolean;
        method: string;
        selector: string | null;
      } | null;

      if (result?.success) {
        this.stats.cookieBanners++;
        return {
          handled: true,
          type: "cookie_banner",
          method: `cookie_${result.method}`,
          selector: result.selector || undefined,
          timeMs: Date.now() - start,
        };
      }
    } catch {
      // Ignorieren — kein Cookie-Banner oder Script-Fehler
    }

    return {
      handled: false,
      type: "cookie_banner",
      method: "none",
      timeMs: Date.now() - start,
    };
  }

  /**
   * Versucht ein Popup/Overlay zu schließen.
   */
  async dismissPopup(session: BrowserSession, url: string): Promise<ObstacleResult> {
    const start = Date.now();
    this.stats.total++;

    try {
      const execResult = await executeScript(session, url, POPUP_DISMISS_SCRIPT);
      const result = execResult.result as {
        success: boolean;
        method: string;
        selector: string | null;
      } | null;

      if (result?.success) {
        this.stats.popups++;
        return {
          handled: true,
          type: "popup",
          method: `popup_${result.method}`,
          selector: result.selector || undefined,
          timeMs: Date.now() - start,
        };
      }
    } catch {
      // Ignorieren
    }

    return {
      handled: false,
      type: "popup",
      method: "none",
      timeMs: Date.now() - start,
    };
  }

  /**
   * Versucht ein Newsletter-Popup zu schließen.
   */
  async dismissNewsletter(session: BrowserSession, url: string): Promise<ObstacleResult> {
    const start = Date.now();

    try {
      const execResult = await executeScript(session, url, NEWSLETTER_DISMISS_SCRIPT);
      const result = execResult.result as {
        success: boolean;
        method: string;
        selector: string | null;
      } | null;

      if (result?.success) {
        return {
          handled: true,
          type: "newsletter_popup",
          method: `newsletter_${result.method}`,
          selector: result.selector || undefined,
          timeMs: Date.now() - start,
        };
      }
    } catch {
      // Ignorieren
    }

    return {
      handled: false,
      type: "newsletter_popup",
      method: "none",
      timeMs: Date.now() - start,
    };
  }

  /** Statistiken */
  getStats(): { cookieBanners: number; popups: number; overlays: number; total: number } {
    return { ...this.stats };
  }

  /** Alle behandelten Hindernisse */
  getHandledObstacles(): ObstacleResult[] {
    return this.handledObstacles;
  }
}
