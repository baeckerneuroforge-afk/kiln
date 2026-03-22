/**
 * Sandbox API Service — Programmatischer Zugriff auf Browser-Automatisierung und Code-Ausführung.
 * Verwaltet Sessions, Actions und Credit-Tracking über die bestehende Infrastruktur.
 */

import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";
import { isAdmin } from "@/lib/admin";
import {
  createBrowserSession,
  navigateTo,
  takeBrowserScreenshot,
  scrollPage,
  getPageContent,
  closeBrowserSession,
  type BrowserSession,
} from "@/lib/browser-service";
import {
  createSandbox,
  executeCode,
  destroySandbox as destroyCodeSandbox,
} from "@/lib/sandbox/code-sandbox";

/* ── Types ── */

export type SandboxCapability = "browser" | "code_python" | "code_javascript" | "screenshots";

export interface SandboxSessionConfig {
  capabilities: SandboxCapability[];
  timeout?: number; // Sekunden, default 300, max 600
  maxSteps?: number; // default 50
}

export type SandboxAction =
  | { type: "navigate"; url: string }
  | { type: "screenshot" }
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "scroll"; direction: "up" | "down"; amount?: number }
  | { type: "execute_code"; language: "python" | "javascript"; code: string }
  | { type: "read_page" };

export interface SandboxActionResult {
  success: boolean;
  result: unknown;
  screenshot?: string;
  creditsUsed: number;
  error?: string;
  durationMs: number;
}

interface ActionHistoryEntry {
  action: SandboxAction;
  result: SandboxActionResult;
  timestamp: string;
}

/* ── Credit-Kosten pro Action-Typ ── */

const ACTION_CREDITS: Record<string, number> = {
  navigate: 0.5,
  screenshot: 0.3,
  click: 0.3,
  type: 0.2,
  scroll: 0.1,
  execute_code: 1.0,
  read_page: 0.5,
};

/* ── In-Memory Store für Browser/Code-Sandbox-Referenzen ── */

interface SessionResources {
  browserSession?: BrowserSession;
  codeSandboxId?: string;
  currentUrl?: string;
}

const sessionResources = new Map<string, SessionResources>();

/* ── Service ── */

export class SandboxAPIService {
  /**
   * Erstellt eine neue Sandbox-Session.
   */
  static async createSession(
    userId: string,
    config: SandboxSessionConfig
  ): Promise<{
    sessionId: string;
    status: string;
    capabilities: SandboxCapability[];
    expiresAt: Date;
    config: { capabilities: SandboxCapability[]; timeout: number; maxSteps: number };
  }> {
    // Plan-Limit prüfen
    const limitCheck = await this.checkSessionLimit(userId);
    if (!limitCheck.allowed) {
      throw new Error(
        `Monatliches Session-Limit erreicht (${limitCheck.current}/${limitCheck.limit}). Bitte Plan upgraden.`
      );
    }

    // Config validieren
    const timeout = Math.min(Math.max(config.timeout ?? 300, 30), 600);
    const maxSteps = Math.min(Math.max(config.maxSteps ?? 50, 1), 200);
    const capabilities = config.capabilities.filter((c): c is SandboxCapability =>
      ["browser", "code_python", "code_javascript", "screenshots"].includes(c)
    );

    if (capabilities.length === 0) {
      throw new Error("Mindestens eine Capability muss angegeben werden.");
    }

    const expiresAt = new Date(Date.now() + timeout * 1000);

    const session = await prisma.sandboxAPISession.create({
      data: {
        userId,
        status: "ready",
        capabilities: capabilities as unknown as import("@prisma/client").Prisma.InputJsonValue,
        config: { timeout, maxSteps } as unknown as import("@prisma/client").Prisma.InputJsonValue,
        actionHistory: [],
        expiresAt,
      },
    });

    // Ressourcen initialisieren
    const resources: SessionResources = {};

    if (capabilities.includes("browser") || capabilities.includes("screenshots")) {
      resources.browserSession = createBrowserSession();
    }

    if (capabilities.includes("code_python")) {
      try {
        const sandbox = await createSandbox("python", timeout * 1000);
        resources.codeSandboxId = sandbox.id;
      } catch {
        // Code-Sandbox optional — Fehler loggen, Session trotzdem erstellen
        console.warn("[SandboxAPI] Code-Sandbox (Python) konnte nicht erstellt werden");
      }
    }

    if (capabilities.includes("code_javascript") && !resources.codeSandboxId) {
      try {
        const sandbox = await createSandbox("javascript", timeout * 1000);
        resources.codeSandboxId = sandbox.id;
      } catch {
        console.warn("[SandboxAPI] Code-Sandbox (JavaScript) konnte nicht erstellt werden");
      }
    }

    sessionResources.set(session.id, resources);

    return {
      sessionId: session.id,
      status: "ready",
      capabilities,
      expiresAt,
      config: { capabilities, timeout, maxSteps },
    };
  }

  /**
   * Führt eine Action in der Sandbox-Session aus.
   */
  static async executeAction(
    sessionId: string,
    userId: string,
    action: SandboxAction
  ): Promise<SandboxActionResult> {
    const session = await prisma.sandboxAPISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error("Session nicht gefunden.");
    }

    if (session.userId !== userId) {
      throw new Error("Kein Zugriff auf diese Session.");
    }

    if (["destroyed", "expired", "completed"].includes(session.status)) {
      throw new Error(`Session ist bereits ${session.status}.`);
    }

    // Ablauf prüfen
    if (new Date() > session.expiresAt) {
      await prisma.sandboxAPISession.update({
        where: { id: sessionId },
        data: { status: "expired" },
      });
      throw new Error("Session ist abgelaufen.");
    }

    // maxSteps prüfen
    const actionHistory = (session.actionHistory as unknown as ActionHistoryEntry[]) || [];
    const sessionConfig = session.config as unknown as Record<string, unknown>;
    const maxSteps = (sessionConfig.maxSteps as number) || 50;

    if (actionHistory.length >= maxSteps) {
      await prisma.sandboxAPISession.update({
        where: { id: sessionId },
        data: { status: "completed" },
      });
      throw new Error(`Maximale Anzahl an Actions erreicht (${maxSteps}).`);
    }

    // Capabilities prüfen
    const capabilities = session.capabilities as unknown as SandboxCapability[];
    this.validateActionCapability(action, capabilities);

    // Status auf "active" setzen, falls noch "ready"
    if (session.status === "ready") {
      await prisma.sandboxAPISession.update({
        where: { id: sessionId },
        data: { status: "active" },
      });
    }

    // Action ausführen
    const start = Date.now();
    let result: SandboxActionResult;

    try {
      result = await this.performAction(sessionId, action);
    } catch (err) {
      result = {
        success: false,
        result: null,
        creditsUsed: ACTION_CREDITS[action.type] || 0.1,
        error: err instanceof Error ? err.message : "Action fehlgeschlagen",
        durationMs: Date.now() - start,
      };
    }

    // Action-History und Credits aktualisieren
    const newEntry: ActionHistoryEntry = {
      action,
      result,
      timestamp: new Date().toISOString(),
    };

    await prisma.sandboxAPISession.update({
      where: { id: sessionId },
      data: {
        actionHistory: [...actionHistory, newEntry] as unknown as import("@prisma/client").Prisma.InputJsonValue,
        creditsUsed: { increment: result.creditsUsed },
      },
    });

    return result;
  }

  /**
   * Gibt Session-Details inkl. Action-History zurück.
   */
  static async getSession(sessionId: string, userId: string) {
    const session = await prisma.sandboxAPISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error("Session nicht gefunden.");
    }

    if (session.userId !== userId) {
      throw new Error("Kein Zugriff auf diese Session.");
    }

    // Ablauf prüfen und Status aktualisieren
    if (
      !["destroyed", "expired", "completed"].includes(session.status) &&
      new Date() > session.expiresAt
    ) {
      await prisma.sandboxAPISession.update({
        where: { id: sessionId },
        data: { status: "expired" },
      });
      session.status = "expired";
    }

    const actionHistory = (session.actionHistory as unknown as ActionHistoryEntry[]) || [];

    return {
      id: session.id,
      status: session.status,
      capabilities: session.capabilities as unknown as SandboxCapability[],
      config: session.config,
      actionHistory,
      actionsExecuted: actionHistory.length,
      creditsUsed: session.creditsUsed,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  /**
   * Zerstört eine Session und räumt Ressourcen auf.
   */
  static async destroySession(sessionId: string, userId: string): Promise<void> {
    const session = await prisma.sandboxAPISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error("Session nicht gefunden.");
    }

    if (session.userId !== userId) {
      throw new Error("Kein Zugriff auf diese Session.");
    }

    // Ressourcen aufräumen
    const resources = sessionResources.get(sessionId);
    if (resources) {
      if (resources.browserSession) {
        closeBrowserSession(resources.browserSession.id);
      }
      if (resources.codeSandboxId) {
        await destroyCodeSandbox(resources.codeSandboxId).catch(() => {});
      }
      sessionResources.delete(sessionId);
    }

    await prisma.sandboxAPISession.update({
      where: { id: sessionId },
      data: { status: "destroyed" },
    });
  }

  /**
   * Bereinigt abgelaufene Sessions (Cron-Job / periodischer Aufruf).
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.sandboxAPISession.updateMany({
      where: {
        status: { in: ["ready", "active"] },
        expiresAt: { lt: new Date() },
      },
      data: { status: "expired" },
    });

    // In-Memory-Ressourcen aufräumen
    for (const [id, resources] of sessionResources) {
      const sess = await prisma.sandboxAPISession.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!sess || sess.status === "expired" || sess.status === "destroyed") {
        if (resources.browserSession) {
          closeBrowserSession(resources.browserSession.id);
        }
        if (resources.codeSandboxId) {
          await destroyCodeSandbox(resources.codeSandboxId).catch(() => {});
        }
        sessionResources.delete(id);
      }
    }

    return result.count;
  }

  /* ── Private Hilfsfunktionen ── */

  /**
   * Prüft das monatliche Session-Limit des Users.
   */
  private static async checkSessionLimit(
    userId: string
  ): Promise<{ allowed: boolean; current: number; limit: number }> {
    if (isAdmin(userId)) {
      return { allowed: true, current: 0, limit: 999999 };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const plan = (user?.plan || "FREE") as PlanType;
    const limits = PLAN_LIMITS[plan];

    if (!limits.sandboxAPI) {
      throw new Error(
        "Sandbox API ist in deinem Plan nicht verfügbar. Bitte auf Pro oder höher upgraden."
      );
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const sessionCount = await prisma.sandboxAPISession.count({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
      },
    });

    return {
      allowed: sessionCount < limits.sandboxAPISessionsPerMonth,
      current: sessionCount,
      limit: limits.sandboxAPISessionsPerMonth,
    };
  }

  /**
   * Validiert ob die Action zu den Session-Capabilities passt.
   */
  private static validateActionCapability(
    action: SandboxAction,
    capabilities: SandboxCapability[]
  ): void {
    const browserActions = ["navigate", "click", "type", "scroll", "read_page"];
    const screenshotActions = ["screenshot"];

    if (browserActions.includes(action.type) && !capabilities.includes("browser")) {
      throw new Error(`Action "${action.type}" erfordert die Capability "browser".`);
    }

    if (
      screenshotActions.includes(action.type) &&
      !capabilities.includes("screenshots") &&
      !capabilities.includes("browser")
    ) {
      throw new Error(
        `Action "${action.type}" erfordert die Capability "screenshots" oder "browser".`
      );
    }

    if (action.type === "execute_code") {
      const langCap = action.language === "python" ? "code_python" : "code_javascript";
      if (!capabilities.includes(langCap)) {
        throw new Error(
          `Code-Ausführung in ${action.language} erfordert die Capability "${langCap}".`
        );
      }
    }
  }

  /**
   * Führt die eigentliche Action über Browser-/Code-Services aus.
   */
  private static async performAction(
    sessionId: string,
    action: SandboxAction
  ): Promise<SandboxActionResult> {
    const resources = sessionResources.get(sessionId) || {};
    const start = Date.now();
    const credits = ACTION_CREDITS[action.type] || 0.1;

    switch (action.type) {
      case "navigate": {
        if (!resources.browserSession) {
          throw new Error("Browser-Session nicht verfügbar.");
        }
        const navResult = await navigateTo(resources.browserSession, action.url);
        resources.currentUrl = action.url;
        sessionResources.set(sessionId, resources);

        return {
          success: true,
          result: {
            url: action.url,
            contentLength: navResult.content.length,
            contentPreview: navResult.content.slice(0, 500),
          },
          screenshot: navResult.screenshot || undefined,
          creditsUsed: credits,
          durationMs: Date.now() - start,
        };
      }

      case "screenshot": {
        if (!resources.browserSession) {
          throw new Error("Browser-Session nicht verfügbar.");
        }
        const url = resources.currentUrl || "about:blank";
        const screenshot = await takeBrowserScreenshot(resources.browserSession, url);

        return {
          success: !!screenshot,
          result: { format: "base64_png" },
          screenshot: screenshot || undefined,
          creditsUsed: credits,
          error: screenshot ? undefined : "Screenshot fehlgeschlagen",
          durationMs: Date.now() - start,
        };
      }

      case "click": {
        if (!resources.browserSession) {
          throw new Error("Browser-Session nicht verfügbar.");
        }
        const clickUrl = resources.currentUrl || "about:blank";
        const BROWSERLESS_BASE = "https://production-sfo.browserless.io";
        const apiKey = process.env.BROWSERLESS_API_KEY;

        if (!apiKey) {
          throw new Error("Browser-Service nicht konfiguriert (BROWSERLESS_API_KEY fehlt).");
        }

        const clickResponse = await fetch(`${BROWSERLESS_BASE}/function?token=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: `
              module.exports = async ({ page }) => {
                await page.goto('${clickUrl.replace(/'/g, "\\'")}', { waitUntil: 'networkidle2', timeout: 30000 });
                await page.mouse.click(${action.x}, ${action.y});
                await new Promise(r => setTimeout(r, 1000));
                return { success: true, newUrl: page.url() };
              };
            `,
          }),
          signal: AbortSignal.timeout(45000),
        });

        const clickResult = (await clickResponse.json()) as {
          data?: { success: boolean; newUrl?: string };
          error?: string;
        };

        if (clickResult.data?.newUrl) {
          resources.currentUrl = clickResult.data.newUrl;
          sessionResources.set(sessionId, resources);
        }

        return {
          success: !clickResult.error,
          result: { x: action.x, y: action.y, newUrl: clickResult.data?.newUrl },
          creditsUsed: credits,
          error: clickResult.error,
          durationMs: Date.now() - start,
        };
      }

      case "type": {
        if (!resources.browserSession) {
          throw new Error("Browser-Session nicht verfügbar.");
        }
        const typeUrl = resources.currentUrl || "about:blank";
        const BROWSERLESS_TYPE = "https://production-sfo.browserless.io";
        const typeApiKey = process.env.BROWSERLESS_API_KEY;

        if (!typeApiKey) {
          throw new Error("Browser-Service nicht konfiguriert (BROWSERLESS_API_KEY fehlt).");
        }

        const typeResponse = await fetch(`${BROWSERLESS_TYPE}/function?token=${typeApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: `
              module.exports = async ({ page }) => {
                await page.goto('${typeUrl.replace(/'/g, "\\'")}', { waitUntil: 'networkidle2', timeout: 30000 });
                await page.keyboard.type('${action.text.replace(/'/g, "\\'")}', { delay: 30 });
                return { success: true };
              };
            `,
          }),
          signal: AbortSignal.timeout(45000),
        });

        const typeResult = (await typeResponse.json()) as { error?: string };

        return {
          success: !typeResult.error,
          result: { text: action.text, length: action.text.length },
          creditsUsed: credits,
          error: typeResult.error,
          durationMs: Date.now() - start,
        };
      }

      case "scroll": {
        if (!resources.browserSession) {
          throw new Error("Browser-Session nicht verfügbar.");
        }
        const scrollUrl = resources.currentUrl || "about:blank";
        const scrollResult = await scrollPage(
          resources.browserSession,
          scrollUrl,
          action.direction,
          action.amount || 500
        );

        return {
          success: scrollResult.success,
          result: { direction: action.direction, amount: action.amount || 500 },
          creditsUsed: credits,
          durationMs: Date.now() - start,
        };
      }

      case "execute_code": {
        if (!resources.codeSandboxId) {
          throw new Error("Code-Sandbox nicht verfügbar. E2B_API_KEY möglicherweise nicht gesetzt.");
        }
        const codeResult = await executeCode(
          resources.codeSandboxId,
          action.language,
          action.code
        );

        return {
          success: codeResult.success,
          result: {
            stdout: codeResult.stdout,
            stderr: codeResult.stderr,
            artifacts: codeResult.artifacts,
          },
          creditsUsed: credits,
          error: codeResult.error,
          durationMs: codeResult.durationMs,
        };
      }

      case "read_page": {
        if (!resources.browserSession) {
          throw new Error("Browser-Session nicht verfügbar.");
        }
        const readUrl = resources.currentUrl || "about:blank";
        const content = await getPageContent(resources.browserSession, readUrl);

        return {
          success: true,
          result: {
            content: content.slice(0, 50000),
            contentLength: content.length,
            url: readUrl,
          },
          creditsUsed: credits,
          durationMs: Date.now() - start,
        };
      }

      default:
        throw new Error(`Unbekannter Action-Typ: ${(action as { type: string }).type}`);
    }
  }
}
