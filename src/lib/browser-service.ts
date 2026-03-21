/**
 * Browser Service — Browserless.io API Wrapper
 * Ermöglicht echte Browser-Steuerung über die Browserless API.
 * Fallback: HTTP-Fetching + Screenshot-Service wenn kein API Key.
 */

const BROWSERLESS_BASE = "https://production-sfo.browserless.io";

export interface BrowserSession {
  id: string;
  wsEndpoint: string | null;
  status: "active" | "closed" | "error";
  createdAt: string;
  screenshots: string[]; // base64 PNGs
  actionLog: BrowserAction[];
}

export interface BrowserAction {
  type: "navigate" | "click" | "type" | "scroll" | "script" | "screenshot" | "wait";
  detail: string;
  timestamp: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

interface BrowserlessResponse {
  data?: unknown;
  screenshot?: string;
  error?: string;
}

// In-memory session store
const activeSessions = new Map<string, BrowserSession>();

/**
 * Prüft ob der Browserless-Service verfügbar ist.
 */
export function isBrowserServiceAvailable(): boolean {
  return !!process.env.BROWSERLESS_API_KEY;
}

/**
 * Erstellt eine neue Browser-Session.
 */
export function createBrowserSession(): BrowserSession {
  const session: BrowserSession = {
    id: `browser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    wsEndpoint: null,
    status: "active",
    createdAt: new Date().toISOString(),
    screenshots: [],
    actionLog: [],
  };
  activeSessions.set(session.id, session);
  return session;
}

/**
 * Holt eine aktive Session.
 */
export function getBrowserSession(sessionId: string): BrowserSession | null {
  return activeSessions.get(sessionId) || null;
}

function logAction(session: BrowserSession, action: Omit<BrowserAction, "timestamp">): void {
  session.actionLog.push({
    ...action,
    timestamp: new Date().toISOString(),
  });
}

function getApiKey(): string {
  const key = process.env.BROWSERLESS_API_KEY;
  if (!key) throw new Error("BROWSERLESS_API_KEY nicht konfiguriert");
  return key;
}

/**
 * Navigiert zu einer URL und gibt den Seiteninhalt zurück.
 */
export async function navigateTo(
  session: BrowserSession,
  url: string,
  options?: { waitForSelector?: string; timeout?: number }
): Promise<{ content: string; screenshot: string | null }> {
  const start = Date.now();
  const apiKey = getApiKey();

  try {
    // Content holen via /content API
    const contentResponse = await fetch(`${BROWSERLESS_BASE}/content?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        waitForSelector: options?.waitForSelector,
        waitForTimeout: options?.timeout || 5000,
        gotoOptions: { waitUntil: "networkidle2", timeout: 30000 },
      }),
      signal: AbortSignal.timeout(35000),
    });

    if (!contentResponse.ok) {
      const errText = await contentResponse.text().catch(() => "");
      throw new Error(`Browserless content error: ${contentResponse.status} ${errText}`);
    }

    const content = await contentResponse.text();

    // Screenshot nehmen
    let screenshot: string | null = null;
    try {
      screenshot = await takeSessionScreenshot(session, url);
    } catch {
      // Screenshot optional
    }

    logAction(session, {
      type: "navigate",
      detail: url,
      durationMs: Date.now() - start,
      success: true,
    });

    return { content: content.slice(0, 100000), screenshot };
  } catch (err) {
    logAction(session, {
      type: "navigate",
      detail: url,
      durationMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : "Navigation fehlgeschlagen",
    });
    throw err;
  }
}

/**
 * Klickt auf ein Element (via JavaScript-Ausführung).
 */
export async function clickElement(
  session: BrowserSession,
  url: string,
  selector: string
): Promise<{ success: boolean; newUrl?: string }> {
  const start = Date.now();
  const apiKey = getApiKey();

  try {
    const response = await fetch(`${BROWSERLESS_BASE}/function?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: `
          module.exports = async ({ page }) => {
            await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle2', timeout: 30000 });
            const el = await page.$('${selector.replace(/'/g, "\\'")}');
            if (!el) return { success: false, error: 'Element nicht gefunden' };
            await el.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
            return { success: true, newUrl: page.url() };
          };
        `,
      }),
      signal: AbortSignal.timeout(45000),
    });

    const result = await response.json() as BrowserlessResponse;

    logAction(session, {
      type: "click",
      detail: `${selector} on ${url}`,
      durationMs: Date.now() - start,
      success: !result.error,
      error: result.error,
    });

    if (result.error) return { success: false };
    const data = result.data as { success: boolean; newUrl?: string } | undefined;
    return { success: data?.success ?? true, newUrl: data?.newUrl };
  } catch (err) {
    logAction(session, {
      type: "click",
      detail: selector,
      durationMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : "Click fehlgeschlagen",
    });
    return { success: false };
  }
}

/**
 * Tippt Text in ein Eingabefeld.
 */
export async function typeText(
  session: BrowserSession,
  url: string,
  selector: string,
  text: string
): Promise<{ success: boolean }> {
  const start = Date.now();
  const apiKey = getApiKey();

  try {
    const response = await fetch(`${BROWSERLESS_BASE}/function?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: `
          module.exports = async ({ page }) => {
            await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle2', timeout: 30000 });
            await page.type('${selector.replace(/'/g, "\\'")}', '${text.replace(/'/g, "\\'")}', { delay: 50 });
            return { success: true };
          };
        `,
      }),
      signal: AbortSignal.timeout(45000),
    });

    const result = await response.json() as BrowserlessResponse;

    logAction(session, {
      type: "type",
      detail: `"${text.slice(0, 50)}" in ${selector}`,
      durationMs: Date.now() - start,
      success: !result.error,
      error: result.error,
    });

    return { success: !result.error };
  } catch (err) {
    logAction(session, {
      type: "type",
      detail: `${selector}: ${text.slice(0, 50)}`,
      durationMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : "Typing fehlgeschlagen",
    });
    return { success: false };
  }
}

/**
 * Scrollt die Seite.
 */
export async function scrollPage(
  session: BrowserSession,
  url: string,
  direction: "up" | "down" = "down",
  pixels: number = 500
): Promise<{ success: boolean }> {
  const start = Date.now();
  const apiKey = getApiKey();
  const scrollY = direction === "down" ? pixels : -pixels;

  try {
    await fetch(`${BROWSERLESS_BASE}/function?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: `
          module.exports = async ({ page }) => {
            await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle2', timeout: 30000 });
            await page.evaluate((y) => window.scrollBy(0, y), ${scrollY});
            await new Promise(r => setTimeout(r, 500));
            return { success: true };
          };
        `,
      }),
      signal: AbortSignal.timeout(35000),
    });

    logAction(session, {
      type: "scroll",
      detail: `${direction} ${pixels}px`,
      durationMs: Date.now() - start,
      success: true,
    });

    return { success: true };
  } catch (err) {
    logAction(session, {
      type: "scroll",
      detail: `${direction} ${pixels}px`,
      durationMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : "Scroll fehlgeschlagen",
    });
    return { success: false };
  }
}

/**
 * Führt JavaScript auf der Seite aus.
 */
export async function executeScript(
  session: BrowserSession,
  url: string,
  script: string
): Promise<{ result: unknown; success: boolean }> {
  const start = Date.now();
  const apiKey = getApiKey();

  try {
    const response = await fetch(`${BROWSERLESS_BASE}/function?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: `
          module.exports = async ({ page }) => {
            await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle2', timeout: 30000 });
            const result = await page.evaluate(() => { ${script} });
            return { result, success: true };
          };
        `,
      }),
      signal: AbortSignal.timeout(45000),
    });

    const data = await response.json() as BrowserlessResponse;

    logAction(session, {
      type: "script",
      detail: script.slice(0, 100),
      durationMs: Date.now() - start,
      success: !data.error,
      error: data.error,
    });

    return { result: (data.data as Record<string, unknown>)?.result ?? null, success: !data.error };
  } catch (err) {
    logAction(session, {
      type: "script",
      detail: script.slice(0, 100),
      durationMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : "Script fehlgeschlagen",
    });
    return { result: null, success: false };
  }
}

/**
 * Holt den Seiteninhalt (Text + strukturierte Daten).
 */
export async function getPageContent(
  session: BrowserSession,
  url: string
): Promise<string> {
  const { content } = await navigateTo(session, url);
  return content;
}

/**
 * Nimmt einen Screenshot via Browserless.
 */
async function takeSessionScreenshot(
  session: BrowserSession,
  url: string,
  options?: { fullPage?: boolean }
): Promise<string> {
  const apiKey = getApiKey();

  const response = await fetch(`${BROWSERLESS_BASE}/screenshot?token=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      options: {
        type: "png",
        fullPage: options?.fullPage ?? false,
        encoding: "base64",
      },
      gotoOptions: { waitUntil: "networkidle2", timeout: 30000 },
    }),
    signal: AbortSignal.timeout(35000),
  });

  if (!response.ok) {
    throw new Error(`Screenshot error: ${response.status}`);
  }

  const base64 = await response.text();
  session.screenshots.push(base64);

  // Max 20 Screenshots pro Session speichern
  if (session.screenshots.length > 20) {
    session.screenshots = session.screenshots.slice(-20);
  }

  return base64;
}

/**
 * Nimmt einen Screenshot (public API).
 */
export async function takeBrowserScreenshot(
  session: BrowserSession,
  url: string,
  options?: { fullPage?: boolean }
): Promise<string | null> {
  try {
    return await takeSessionScreenshot(session, url, options);
  } catch {
    return null;
  }
}

/**
 * Schließt eine Browser-Session.
 */
export function closeBrowserSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = "closed";
    // Cleanup nach 10 Minuten
    setTimeout(() => activeSessions.delete(sessionId), 10 * 60 * 1000);
  }
}

/**
 * Gibt alle aktiven Sessions zurück (für Admin/Debug).
 */
export function getActiveSessions(): BrowserSession[] {
  return Array.from(activeSessions.values()).filter((s) => s.status === "active");
}
