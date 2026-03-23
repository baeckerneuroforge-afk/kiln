/**
 * Browser Service
 * Stateful browser sessions with E2B as the primary backend and Browserless as the secondary backend.
 * HTTP-only callers can still fall back at a higher layer when no browser backend is available.
 */

import { E2BBrowserSession } from "@/lib/browser/e2b-browser-session";

const BROWSERLESS_BASE = "https://production-sfo.browserless.io";
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

export type BrowserBackend = "e2b" | "browserless";

export interface BrowserAction {
  type:
    | "navigate"
    | "click"
    | "click_coordinates"
    | "type"
    | "type_focused"
    | "scroll"
    | "script"
    | "screenshot"
    | "wait";
  detail: string;
  timestamp: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface BrowserSession {
  id: string;
  backend: BrowserBackend;
  status: "active" | "closed" | "error";
  createdAt: string;
  currentUrl: string | null;
  currentHtml: string | null;
  screenshots: string[];
  actionLog: BrowserAction[];
  warning?: string;
  sessionRef?: string;
}

interface RuntimeNavigationResult {
  url: string;
  content: string;
  screenshot: string | null;
}

interface RuntimeMutationResult {
  success: boolean;
  url?: string;
  html?: string;
  screenshot?: string | null;
}

interface BrowserRuntime {
  readonly backend: BrowserBackend;
  readonly sessionRef?: string;
  readonly warning?: string;
  navigate(url: string, options?: { timeout?: number; withScreenshot?: boolean }): Promise<RuntimeNavigationResult>;
  click(selector: string): Promise<RuntimeMutationResult>;
  clickCoordinates(x: number, y: number): Promise<RuntimeMutationResult>;
  type(selector: string, text: string): Promise<RuntimeMutationResult>;
  typeFocused(text: string): Promise<RuntimeMutationResult>;
  scroll(direction: "up" | "down", pixels: number): Promise<RuntimeMutationResult>;
  evaluate(script: string): Promise<{ result: unknown; url?: string; html?: string }>;
  getPageContent(): Promise<string>;
  getCurrentUrl(): Promise<string>;
  screenshot(options?: { fullPage?: boolean }): Promise<string | null>;
  close(): Promise<void>;
}

interface SessionRecord {
  session: BrowserSession;
  runtime: BrowserRuntime;
}

interface BrowserlessResponse {
  data?: unknown;
  error?: string;
}

const activeSessions = new Map<string, SessionRecord>();

export function isBrowserServiceAvailable(): boolean {
  return !!getPreferredBrowserBackend();
}

export function getPreferredBrowserBackend(): BrowserBackend | null {
  if (process.env.E2B_API_KEY) return "e2b";
  if (process.env.BROWSERLESS_API_KEY) return "browserless";
  return null;
}

export async function createBrowserSession(): Promise<BrowserSession> {
  const backend = getPreferredBrowserBackend();
  if (!backend) {
    throw new Error("Computer Use requires an E2B or Browserless API key. Add one in Settings → API Keys.");
  }

  const runtime: BrowserRuntime = backend === "e2b"
    ? await E2BRuntime.start()
    : new BrowserlessRuntime();

  const session: BrowserSession = {
    id: `browser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    backend: runtime.backend,
    status: "active",
    createdAt: new Date().toISOString(),
    currentUrl: null,
    currentHtml: null,
    screenshots: [],
    actionLog: [],
    warning: runtime.warning,
    sessionRef: runtime.sessionRef,
  };

  activeSessions.set(session.id, { session, runtime });
  return session;
}

export function getBrowserSession(sessionId: string): BrowserSession | null {
  return activeSessions.get(sessionId)?.session || null;
}

export async function navigateTo(
  session: BrowserSession,
  url: string,
  options?: { waitForSelector?: string; timeout?: number }
): Promise<{ content: string; screenshot: string | null }> {
  const start = Date.now();
  const record = getSessionRecord(session);

  try {
    const result = await record.runtime.navigate(url, {
      timeout: options?.timeout,
      withScreenshot: true,
    });

    updateSessionState(record.session, {
      url: result.url,
      html: result.content,
      screenshot: result.screenshot,
    });

    logAction(record.session, {
      type: "navigate",
      detail: url,
      durationMs: Date.now() - start,
      success: true,
    });

    return {
      content: result.content.slice(0, 100000),
      screenshot: result.screenshot,
    };
  } catch (error) {
    record.session.status = "error";
    logAction(record.session, {
      type: "navigate",
      detail: url,
      durationMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : "Navigation failed",
    });
    throw error;
  }
}

export async function clickElement(
  session: BrowserSession,
  url: string,
  selector: string
): Promise<{ success: boolean; newUrl?: string }> {
  const start = Date.now();
  const record = getSessionRecord(session);

  try {
    await ensureUrl(record, url);
    const result = await record.runtime.click(selector);
    updateSessionState(record.session, {
      url: result.url,
      html: result.html,
      screenshot: result.screenshot,
    });

    logAction(record.session, {
      type: "click",
      detail: selector,
      durationMs: Date.now() - start,
      success: result.success,
    });

    return {
      success: result.success,
      newUrl: result.url || record.session.currentUrl || undefined,
    };
  } catch (error) {
    logAction(record.session, {
      type: "click",
      detail: selector,
      durationMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : "Click failed",
    });
    return { success: false };
  }
}

export async function clickBrowserCoordinates(
  session: BrowserSession,
  x: number,
  y: number,
  url?: string
): Promise<{ success: boolean; newUrl?: string }> {
  const start = Date.now();
  const record = getSessionRecord(session);

  try {
    await ensureUrl(record, url);
    const result = await record.runtime.clickCoordinates(x, y);
    updateSessionState(record.session, {
      url: result.url,
      html: result.html,
      screenshot: result.screenshot,
    });

    logAction(record.session, {
      type: "click_coordinates",
      detail: `${x},${y}`,
      durationMs: Date.now() - start,
      success: result.success,
    });

    return {
      success: result.success,
      newUrl: result.url || record.session.currentUrl || undefined,
    };
  } catch (error) {
    logAction(record.session, {
      type: "click_coordinates",
      detail: `${x},${y}`,
      durationMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : "Coordinate click failed",
    });
    return { success: false };
  }
}

export async function typeText(
  session: BrowserSession,
  url: string,
  selector: string,
  text: string
): Promise<{ success: boolean }> {
  const start = Date.now();
  const record = getSessionRecord(session);

  try {
    await ensureUrl(record, url);
    const result = await record.runtime.type(selector, text);
    updateSessionState(record.session, {
      url: result.url,
      html: result.html,
      screenshot: result.screenshot,
    });

    logAction(record.session, {
      type: "type",
      detail: `${selector}: ${text.slice(0, 80)}`,
      durationMs: Date.now() - start,
      success: result.success,
    });

    return { success: result.success };
  } catch (error) {
    logAction(record.session, {
      type: "type",
      detail: `${selector}: ${text.slice(0, 80)}`,
      durationMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : "Type failed",
    });
    return { success: false };
  }
}

export async function typeTextInFocusedElement(
  session: BrowserSession,
  text: string,
  url?: string
): Promise<{ success: boolean }> {
  const start = Date.now();
  const record = getSessionRecord(session);

  try {
    await ensureUrl(record, url);
    const result = await record.runtime.typeFocused(text);
    updateSessionState(record.session, {
      url: result.url,
      html: result.html,
      screenshot: result.screenshot,
    });

    logAction(record.session, {
      type: "type_focused",
      detail: text.slice(0, 80),
      durationMs: Date.now() - start,
      success: result.success,
    });

    return { success: result.success };
  } catch (error) {
    logAction(record.session, {
      type: "type_focused",
      detail: text.slice(0, 80),
      durationMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : "Focused typing failed",
    });
    return { success: false };
  }
}

export async function scrollPage(
  session: BrowserSession,
  url: string,
  direction: "up" | "down" = "down",
  pixels = 500
): Promise<{ success: boolean }> {
  const start = Date.now();
  const record = getSessionRecord(session);

  try {
    await ensureUrl(record, url);
    const result = await record.runtime.scroll(direction, pixels);
    updateSessionState(record.session, {
      url: result.url,
      html: result.html,
      screenshot: result.screenshot,
    });

    logAction(record.session, {
      type: "scroll",
      detail: `${direction} ${pixels}px`,
      durationMs: Date.now() - start,
      success: result.success,
    });

    return { success: result.success };
  } catch (error) {
    logAction(record.session, {
      type: "scroll",
      detail: `${direction} ${pixels}px`,
      durationMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : "Scroll failed",
    });
    return { success: false };
  }
}

export async function executeScript(
  session: BrowserSession,
  url: string,
  script: string
): Promise<{ result: unknown; success: boolean }> {
  const start = Date.now();
  const record = getSessionRecord(session);

  try {
    await ensureUrl(record, url);
    const result = await record.runtime.evaluate(script);
    updateSessionState(record.session, {
      url: result.url,
      html: result.html,
    });

    logAction(record.session, {
      type: "script",
      detail: script.slice(0, 120),
      durationMs: Date.now() - start,
      success: true,
    });

    return {
      result: result.result,
      success: true,
    };
  } catch (error) {
    logAction(record.session, {
      type: "script",
      detail: script.slice(0, 120),
      durationMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : "Script failed",
    });
    return {
      result: null,
      success: false,
    };
  }
}

export async function getPageContent(
  session: BrowserSession,
  url: string
): Promise<string> {
  const record = getSessionRecord(session);
  await ensureUrl(record, url);
  const html = await record.runtime.getPageContent();
  updateSessionState(record.session, {
    url: await record.runtime.getCurrentUrl().catch(() => record.session.currentUrl || undefined),
    html,
  });
  return html;
}

export async function getCurrentBrowserUrl(session: BrowserSession): Promise<string> {
  const record = getSessionRecord(session);
  const url = await record.runtime.getCurrentUrl();
  updateSessionState(record.session, { url });
  return url;
}

export async function takeBrowserScreenshot(
  session: BrowserSession,
  url?: string,
  options?: { fullPage?: boolean }
): Promise<string | null> {
  const start = Date.now();
  const record = getSessionRecord(session);

  try {
    await ensureUrl(record, url);
    const screenshot = await record.runtime.screenshot(options);
    if (screenshot) {
      pushScreenshot(record.session, screenshot);
    }

    logAction(record.session, {
      type: "screenshot",
      detail: options?.fullPage ? "full_page" : "viewport",
      durationMs: Date.now() - start,
      success: !!screenshot,
    });

    return screenshot;
  } catch (error) {
    logAction(record.session, {
      type: "screenshot",
      detail: options?.fullPage ? "full_page" : "viewport",
      durationMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : "Screenshot failed",
    });
    return null;
  }
}

export async function closeBrowserSession(sessionId: string): Promise<void> {
  const record = activeSessions.get(sessionId);
  if (!record) return;

  record.session.status = "closed";
  await record.runtime.close().catch(() => {});
  activeSessions.delete(sessionId);
}

export function getActiveSessions(): BrowserSession[] {
  return Array.from(activeSessions.values())
    .map((record) => record.session)
    .filter((session) => session.status === "active");
}

function getSessionRecord(session: BrowserSession): SessionRecord {
  const record = activeSessions.get(session.id);
  if (!record || record.session.status !== "active") {
    throw new Error("Browser session is not active");
  }
  return record;
}

function logAction(session: BrowserSession, action: Omit<BrowserAction, "timestamp">): void {
  session.actionLog.push({
    ...action,
    timestamp: new Date().toISOString(),
  });
}

function updateSessionState(
  session: BrowserSession,
  update: { url?: string; html?: string | null; screenshot?: string | null }
): void {
  if (typeof update.url === "string") {
    session.currentUrl = update.url;
  }
  if (typeof update.html === "string") {
    session.currentHtml = update.html;
  }
  if (update.screenshot) {
    pushScreenshot(session, update.screenshot);
  }
}

function pushScreenshot(session: BrowserSession, screenshot: string): void {
  session.screenshots.push(screenshot);
  if (session.screenshots.length > 20) {
    session.screenshots = session.screenshots.slice(-20);
  }
}

async function ensureUrl(record: SessionRecord, url?: string): Promise<void> {
  const targetUrl = (url || "").trim();
  if (!targetUrl) return;

  if (record.session.currentUrl !== targetUrl) {
    const result = await record.runtime.navigate(targetUrl, {
      timeout: 30000,
      withScreenshot: false,
    });
    updateSessionState(record.session, {
      url: result.url,
      html: result.content,
      screenshot: result.screenshot,
    });
  }
}

function getBrowserlessApiKey(): string {
  const key = process.env.BROWSERLESS_API_KEY;
  if (!key) {
    throw new Error("BROWSERLESS_API_KEY not configured");
  }
  return key;
}

class E2BRuntime implements BrowserRuntime {
  readonly backend = "e2b" as const;
  readonly sessionRef?: string;

  private readonly session: E2BBrowserSession;

  private constructor(session: E2BBrowserSession) {
    this.session = session;
    this.sessionRef = session.sandboxId;
  }

  static async start(): Promise<E2BRuntime> {
    const session = await E2BBrowserSession.start({
      timeoutMs: SESSION_TIMEOUT_MS,
    });
    return new E2BRuntime(session);
  }

  async navigate(url: string, options?: { timeout?: number; withScreenshot?: boolean }): Promise<RuntimeNavigationResult> {
    const state = await this.session.navigate(url, options);
    return {
      url: state.url,
      content: state.html,
      screenshot: state.screenshot || null,
    };
  }

  async click(selector: string): Promise<RuntimeMutationResult> {
    const state = await this.session.click({ selector });
    return { success: true, url: state.url, html: state.html, screenshot: state.screenshot };
  }

  async clickCoordinates(x: number, y: number): Promise<RuntimeMutationResult> {
    const state = await this.session.click({ x, y });
    return { success: true, url: state.url, html: state.html, screenshot: state.screenshot };
  }

  async type(selector: string, text: string): Promise<RuntimeMutationResult> {
    const state = await this.session.type({ selector, text, clear: true });
    return { success: true, url: state.url, html: state.html, screenshot: state.screenshot };
  }

  async typeFocused(text: string): Promise<RuntimeMutationResult> {
    const state = await this.session.type({ text });
    return { success: true, url: state.url, html: state.html, screenshot: state.screenshot };
  }

  async scroll(direction: "up" | "down", pixels: number): Promise<RuntimeMutationResult> {
    const state = await this.session.scroll(direction, pixels);
    return { success: true, url: state.url, html: state.html, screenshot: state.screenshot };
  }

  async evaluate(script: string): Promise<{ result: unknown; url?: string; html?: string }> {
    const result = await this.session.evaluate<unknown>(script);
    const state = await this.session.state();
    return {
      result,
      url: state.url,
      html: state.html,
    };
  }

  async getPageContent(): Promise<string> {
    const state = await this.session.state();
    return state.html;
  }

  async getCurrentUrl(): Promise<string> {
    const state = await this.session.state();
    return state.url;
  }

  async screenshot(options?: { fullPage?: boolean }): Promise<string | null> {
    return this.session.screenshot(options);
  }

  async close(): Promise<void> {
    await this.session.close();
  }
}

class BrowserlessRuntime implements BrowserRuntime {
  readonly backend = "browserless" as const;
  readonly warning =
    "Running on Browserless compatibility mode. Multi-step state is more limited than E2B-backed browser sessions.";

  private currentUrl: string | null = null;
  private currentHtml: string | null = null;
  private lastClickPoint: { x: number; y: number } | null = null;

  async navigate(url: string, options?: { timeout?: number; withScreenshot?: boolean }): Promise<RuntimeNavigationResult> {
    const apiKey = getBrowserlessApiKey();
    const response = await fetch(`${BROWSERLESS_BASE}/content?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        waitForTimeout: options?.timeout || 5000,
        gotoOptions: { waitUntil: "networkidle2", timeout: options?.timeout || 30000 },
      }),
      signal: AbortSignal.timeout(35000),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => "");
      throw new Error(`Browserless navigate failed: ${response.status} ${error}`);
    }

    const content = await response.text();
    this.currentUrl = url;
    this.currentHtml = content;

    const screenshot = options?.withScreenshot
      ? await this.screenshot()
      : null;

    return {
      url: this.currentUrl,
      content,
      screenshot,
    };
  }

  async click(selector: string): Promise<RuntimeMutationResult> {
    const url = this.requireUrl();
    const result = await this.runFunction<{
      success: boolean;
      url: string;
      html: string;
    }>(`
      module.exports = async ({ page }) => {
        await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle2", timeout: 30000 });
        const element = await page.$(${JSON.stringify(selector)});
        if (!element) return { success: false, url: page.url(), html: await page.content() };
        await element.click();
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 5000 }).catch(() => {});
        return { success: true, url: page.url(), html: await page.content() };
      };
    `);

    this.currentUrl = result.url || url;
    this.currentHtml = result.html || this.currentHtml;
    return { success: !!result.success, url: this.currentUrl, html: this.currentHtml || undefined };
  }

  async clickCoordinates(x: number, y: number): Promise<RuntimeMutationResult> {
    const url = this.requireUrl();
    const result = await this.runFunction<{
      success: boolean;
      url: string;
      html: string;
    }>(`
      module.exports = async ({ page }) => {
        await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle2", timeout: 30000 });
        await page.mouse.click(${x}, ${y});
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 5000 }).catch(() => {});
        return { success: true, url: page.url(), html: await page.content() };
      };
    `);

    this.lastClickPoint = { x, y };
    this.currentUrl = result.url || url;
    this.currentHtml = result.html || this.currentHtml;
    return { success: !!result.success, url: this.currentUrl, html: this.currentHtml || undefined };
  }

  async type(selector: string, text: string): Promise<RuntimeMutationResult> {
    const url = this.requireUrl();
    const result = await this.runFunction<{
      success: boolean;
      url: string;
      html: string;
    }>(`
      module.exports = async ({ page }) => {
        await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle2", timeout: 30000 });
        await page.focus(${JSON.stringify(selector)});
        await page.click(${JSON.stringify(selector)}, { clickCount: 3 }).catch(() => {});
        await page.keyboard.press("Backspace").catch(() => {});
        await page.type(${JSON.stringify(selector)}, ${JSON.stringify(text)}, { delay: 25 });
        return { success: true, url: page.url(), html: await page.content() };
      };
    `);

    this.currentUrl = result.url || url;
    this.currentHtml = result.html || this.currentHtml;
    return { success: !!result.success, url: this.currentUrl, html: this.currentHtml || undefined };
  }

  async typeFocused(text: string): Promise<RuntimeMutationResult> {
    const url = this.requireUrl();
    const point = this.lastClickPoint;
    const result = await this.runFunction<{
      success: boolean;
      url: string;
      html: string;
    }>(`
      module.exports = async ({ page }) => {
        await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle2", timeout: 30000 });
        const point = ${JSON.stringify(point)};
        if (point) {
          await page.mouse.click(point.x, point.y);
        }
        await page.keyboard.type(${JSON.stringify(text)}, { delay: 25 });
        return { success: true, url: page.url(), html: await page.content() };
      };
    `);

    this.currentUrl = result.url || url;
    this.currentHtml = result.html || this.currentHtml;
    return { success: !!result.success, url: this.currentUrl, html: this.currentHtml || undefined };
  }

  async scroll(direction: "up" | "down", pixels: number): Promise<RuntimeMutationResult> {
    const url = this.requireUrl();
    const delta = direction === "up" ? -Math.abs(pixels) : Math.abs(pixels);
    const result = await this.runFunction<{
      success: boolean;
      url: string;
      html: string;
    }>(`
      module.exports = async ({ page }) => {
        await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle2", timeout: 30000 });
        await page.evaluate((scrollDelta) => window.scrollBy(0, scrollDelta), ${delta});
        await new Promise((resolve) => setTimeout(resolve, 350));
        return { success: true, url: page.url(), html: await page.content() };
      };
    `);

    this.currentUrl = result.url || url;
    this.currentHtml = result.html || this.currentHtml;
    return { success: !!result.success, url: this.currentUrl, html: this.currentHtml || undefined };
  }

  async evaluate(script: string): Promise<{ result: unknown; url?: string; html?: string }> {
    const url = this.requireUrl();
    const result = await this.runFunction<{
      result: unknown;
      url: string;
      html: string;
    }>(`
      module.exports = async ({ page }) => {
        await page.goto(${JSON.stringify(url)}, { waitUntil: "networkidle2", timeout: 30000 });
        const source = ${JSON.stringify(script)};
        const evaluated = await page.evaluate((source) => (new Function(source))(), source);
        return { result: evaluated, url: page.url(), html: await page.content() };
      };
    `);

    this.currentUrl = result.url || url;
    this.currentHtml = result.html || this.currentHtml;
    return {
      result: result.result,
      url: this.currentUrl,
      html: this.currentHtml || undefined,
    };
  }

  async getPageContent(): Promise<string> {
    if (this.currentHtml) return this.currentHtml;
    const url = this.requireUrl();
    const result = await this.navigate(url, { withScreenshot: false });
    return result.content;
  }

  async getCurrentUrl(): Promise<string> {
    return this.requireUrl();
  }

  async screenshot(options?: { fullPage?: boolean }): Promise<string | null> {
    const url = this.requireUrl();
    const apiKey = getBrowserlessApiKey();
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
      throw new Error(`Browserless screenshot failed: ${response.status}`);
    }

    return response.text();
  }

  async close(): Promise<void> {
    return;
  }

  private requireUrl(): string {
    if (!this.currentUrl) {
      throw new Error("Browserless session has no active page. Navigate first.");
    }
    return this.currentUrl;
  }

  private async runFunction<T>(code: string): Promise<T> {
    const apiKey = getBrowserlessApiKey();
    const response = await fetch(`${BROWSERLESS_BASE}/function?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => "");
      throw new Error(`Browserless function failed: ${response.status} ${error}`);
    }

    const payload = await response.json() as BrowserlessResponse;
    if (payload.error) {
      throw new Error(payload.error);
    }

    return (payload.data || {}) as T;
  }
}
