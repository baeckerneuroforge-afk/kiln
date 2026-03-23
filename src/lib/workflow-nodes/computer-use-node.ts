/**
 * Computer Use Node Executor — V2.0
 * Real Browser Control via Browserless API mit Visual Reasoning Loop.
 * Fallback: HTTP-Fetching + Screenshot-Service (V1.0 Verhalten).
 */

import {
  resolveExpression,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import { safeFetch } from "@/lib/url-validation";
import { takeScreenshot } from "@/lib/screenshot-service";
import {
  getDecryptedCredential,
  markCredentialUsed,
} from "@/lib/computer-use-credentials";
import {
  isBrowserServiceAvailable,
  createBrowserSession,
  navigateTo as browserNavigate,
  takeBrowserScreenshot,
  closeBrowserSession,
} from "@/lib/browser-service";
import {
  isCodeSandboxAvailable,
} from "@/lib/sandbox/code-sandbox";
import {
  executePython,
  executeJavascript,
  cleanupCodeSession,
} from "@/lib/sandbox/code-tools";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { StepVerifier } from "@/lib/sandbox/step-verifier";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ReasoningLogger } from "@/lib/sandbox/reasoning-logger";
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  findProcedure,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  saveProcedure,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  procedureToPromptHint,
} from "@/lib/sandbox/procedural-memory";
import { routeAction } from "@/lib/mcp/hybrid-router";
import { executeMCPTool } from "@/lib/mcp/mcp-tool-bridge";
import { ElementFinder } from "@/lib/browser/element-finder";
import { ScreenshotStrategy } from "@/lib/browser/screenshot-strategy";
import { ActionExecutor } from "@/lib/browser/action-executor";
import { DomVerifier } from "@/lib/browser/dom-verifier";
import { PageCache } from "@/lib/browser/page-cache";
import { ReliabilityMetrics } from "@/lib/browser/reliability-metrics";

const COMPUTER_USE_MODEL = "claude-sonnet-4-6";
const VISION_MODEL = "claude-sonnet-4-6";
const MAX_LOOP_STEPS = 25;

/* ── Types ── */

export interface ComputerUseSessionStep {
  stepIndex: number;
  url: string;
  action: "navigate" | "click_link" | "extract_data" | "done" | "analyze" | "click" | "type" | "scroll" | "execute_code";
  actionDetail: string;
  htmlSummary: string;
  screenshot: string | null; // base64 PNG
  extractedData: Record<string, unknown> | null;
  timestamp: string; // ISO
  durationMs: number;
  verified?: boolean; // Visual Verification Ergebnis
}

export interface ComputerUseSession {
  task: string;
  startUrl: string;
  steps: ComputerUseSessionStep[];
  summary: string;
  extractedData: Record<string, unknown> | null;
  totalDurationMs: number;
  urlsVisited: string[];
  screenshotsAvailable: boolean;
  completionReason: "done" | "max_steps" | "no_next_url" | "error";
  browserMode: "real" | "http"; // V2.0: welcher Modus verwendet wurde
  sessionId?: string; // Browser Session ID für Live-View
}

/* ── Claude Action Response (V2.0 erweitert) ── */

interface ClaudeAction {
  action: "navigate" | "click_link" | "click" | "type" | "scroll" | "extract_data" | "done" | "execute_code";
  url?: string;
  selector?: string;
  text?: string; // Für type-Aktion
  direction?: "up" | "down"; // Für scroll-Aktion
  pixels?: number;
  fields?: string[];
  summary?: string;
  extracted_data?: Record<string, unknown>;
  reasoning: string;
  code?: string; // Für execute_code-Aktion
  code_language?: "python" | "javascript"; // Für execute_code-Aktion
}

/* ── HTML Parsing Helpers ── */

function extractHtmlSummary(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 100) : "";

  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
  const meta = metaMatch ? metaMatch[1].trim().slice(0, 200) : "";

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim().slice(0, 100) : "";

  return [title, h1, meta].filter(Boolean).join(" | ").slice(0, 300);
}

function resolveLink(html: string, selector: string, baseUrl: string): string | null {
  const selectorLower = selector.toLowerCase().trim();
  const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  const candidates: { url: string; text: string; score: number }[] = [];

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim().toLowerCase();

    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) {
      continue;
    }

    let score = 0;
    if (text === selectorLower) {
      score = 100;
    } else if (text.includes(selectorLower)) {
      score = 80;
    } else if (selectorLower.includes(text) && text.length > 2) {
      score = 60;
    } else if (href.toLowerCase().includes(selectorLower.replace(/\s+/g, "-"))) {
      score = 40;
    } else {
      const selectorWords = selectorLower.split(/\s+/);
      const textWords = text.split(/\s+/);
      const overlap = selectorWords.filter((w) => textWords.includes(w)).length;
      if (overlap > 0) score = Math.min(30, overlap * 10);
    }

    if (score > 0) candidates.push({ url: href, text, score });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);

  try {
    return new URL(candidates[0].url, baseUrl).href;
  } catch {
    return candidates[0].url;
  }
}

function extractDataFromHtml(html: string, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const field of fields) {
    const fieldLower = field.toLowerCase();
    const regex = new RegExp(`${fieldLower}[:\\s]+([^\\n.]+)`, "i");
    const match = textContent.match(regex);
    result[field] = match ? match[1].trim().slice(0, 500) : null;
  }

  return result;
}

/* ── Session / Cookie Support (HTTP Fallback) ── */

interface HttpBrowsingSession {
  cookies: Record<string, string>;
}

function createHttpSession(): HttpBrowsingSession {
  return { cookies: {} };
}

function serializeCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

function captureSetCookies(response: Response, httpSession: HttpBrowsingSession): void {
  const setCookies = response.headers.getSetCookie?.() || [];
  for (const cookie of setCookies) {
    const match = cookie.match(/^([^=]+)=([^;]*)/);
    if (match) httpSession.cookies[match[1].trim()] = match[2].trim();
  }
}

/* ── Page Fetching (HTTP Fallback) ── */

async function fetchPage(
  url: string,
  httpSession?: HttpBrowsingSession
): Promise<{ html: string; finalUrl: string }> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
  };

  if (httpSession && Object.keys(httpSession.cookies).length > 0) {
    headers["Cookie"] = serializeCookies(httpSession.cookies);
  }

  const response = await safeFetch(url, { headers });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  if (httpSession) captureSetCookies(response, httpSession);

  const html = await response.text();
  return { html: html.slice(0, 50000), finalUrl: response.url || url };
}

/* ── Claude Decision Engine (V2.0 mit Vision) ── */

async function askClaudeWithVision(
  task: string,
  currentUrl: string,
  screenshot: string,
  previousSteps: ComputerUseSessionStep[],
  useBrowserMode: boolean,
  enableCodeExecution: boolean = false,
  proceduralHint: string = "",
): Promise<ClaudeAction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");

  const stepsContext = previousSteps.length > 0
    ? `\n\nBisherige Schritte:\n${previousSteps.map((s) =>
        `${s.stepIndex + 1}. [${s.action}] ${s.url} — ${s.actionDetail}${s.verified === false ? " ⚠️ NICHT VERIFIZIERT" : ""}`
      ).join("\n")}`
    : "";

  const browserActions = useBrowserMode
    ? `
5. Auf ein Element klicken (CSS-Selektor):
{"action": "click", "selector": "button.submit", "reasoning": "Warum"}

6. Text eingeben:
{"action": "type", "selector": "input[name=search]", "text": "Suchbegriff", "reasoning": "Warum"}

7. Scrollen:
{"action": "scroll", "direction": "down", "pixels": 500, "reasoning": "Warum"}`
    : "";

  const codeActions = enableCodeExecution
    ? `

8. Code ausführen (Daten verarbeiten, Dateien erstellen, Berechnungen):
{"action": "execute_code", "code": "import pandas as pd\\nprint('Hello')", "code_language": "python", "reasoning": "Warum"}

Nutze Code-Ausführung wenn du Daten analysieren, transformieren, Diagramme erstellen oder Dateien generieren musst.`
    : "";

  const systemPrompt = `Du bist ein visueller Web-Browsing-Agent. Du analysierst Screenshots von Webseiten und entscheidest welche Aktion als nächstes auszuführen ist.

Aktuelle URL: ${currentUrl}
Browser-Modus: ${useBrowserMode ? "Echter Browser (Browserless)" : "HTTP-Fetching"}
${stepsContext}

Antworte AUSSCHLIESSLICH als JSON mit einer dieser Aktionen:

1. Zu einer neuen URL navigieren:
{"action": "navigate", "url": "https://...", "reasoning": "Warum"}

2. Einen Link klicken (Text des Links):
{"action": "click_link", "selector": "Pricing", "reasoning": "Warum"}

3. Daten extrahieren:
{"action": "extract_data", "fields": ["price", "features"], "reasoning": "Warum"}

4. Aufgabe erledigt:
{"action": "done", "summary": "Was gefunden wurde", "extracted_data": {}, "reasoning": "Warum fertig"}
${browserActions}
${codeActions}
${proceduralHint}

Analysiere den Screenshot sorgfältig. Beschreibe was du siehst und wähle die beste Aktion.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: screenshot,
              },
            },
            {
              type: "text",
              text: `Aufgabe: ${task}\n\nAnalysiere diesen Screenshot und entscheide welche Aktion als nächstes ausgeführt werden soll.`,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Claude Vision API: ${(errData as Record<string, unknown>).error || response.statusText}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { action: "done", summary: text, reasoning: "Konnte keine Aktion parsen" };
    }
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ClaudeAction>;
    return {
      action: parsed.action || "done",
      url: parsed.url,
      selector: parsed.selector,
      text: parsed.text,
      direction: parsed.direction,
      pixels: parsed.pixels,
      fields: parsed.fields,
      summary: parsed.summary,
      extracted_data: parsed.extracted_data,
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return { action: "done", summary: text, reasoning: "JSON Parse fehlgeschlagen" };
  }
}

async function askClaudeForAction(
  task: string,
  currentUrl: string,
  pageContent: string,
  htmlSummary: string,
  previousSteps: ComputerUseSessionStep[],
  extractData: boolean,
  dataSchema: string,
  hasScreenshot: boolean,
): Promise<ClaudeAction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");

  const stepsContext = previousSteps.length > 0
    ? `\n\nBisherige Schritte:\n${previousSteps.map((s) =>
        `${s.stepIndex + 1}. [${s.action}] ${s.url} — ${s.actionDetail}`
      ).join("\n")}`
    : "";

  const extractionInstruction = extractData && dataSchema
    ? `\n\nWenn die Aufgabe erledigt ist, extrahiere Daten im Schema:\n${dataSchema}`
    : "";

  const systemPrompt = `Du bist ein Web-Browsing-Agent. Du navigierst Webseiten um eine Aufgabe zu erledigen.

Aktuelle URL: ${currentUrl}
Seiten-Zusammenfassung: ${htmlSummary}
Screenshots verfügbar: ${hasScreenshot ? "Ja" : "Nein (nur HTML)"}
${stepsContext}
${extractionInstruction}

Antworte AUSSCHLIESSLICH als JSON mit einer dieser Aktionen:

1. Zu einer neuen URL navigieren:
{"action": "navigate", "url": "https://...", "reasoning": "Warum"}

2. Einen Link auf der aktuellen Seite klicken (Text des Links angeben):
{"action": "click_link", "selector": "Pricing", "reasoning": "Warum"}

3. Daten von der aktuellen Seite extrahieren:
{"action": "extract_data", "fields": ["price", "features"], "reasoning": "Warum"}

4. Aufgabe ist erledigt:
{"action": "done", "summary": "Was gefunden wurde", "extracted_data": {}, "reasoning": "Warum fertig"}

Wähle die beste Aktion um die Aufgabe zu erfüllen. Sei effizient — navigiere nur wenn nötig.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: COMPUTER_USE_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Aufgabe: ${task}\n\nAktueller Seiteninhalt (gekürzt):\n\`\`\`html\n${pageContent.slice(0, 30000)}\n\`\`\`\n\nWelche Aktion soll als nächstes ausgeführt werden?`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Claude API Fehler: ${(errData as Record<string, unknown>).error || response.statusText}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { action: "done", summary: text, reasoning: "Konnte keine Aktion parsen" };
    }
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ClaudeAction>;
    return {
      action: parsed.action || "done",
      url: parsed.url,
      selector: parsed.selector,
      fields: parsed.fields,
      summary: parsed.summary,
      extracted_data: parsed.extracted_data,
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return { action: "done", summary: text, reasoning: "JSON Parse fehlgeschlagen" };
  }
}

/* ── Visual Verification ── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function verifyActionWithScreenshot(
  expectedOutcome: string,
  beforeScreenshot: string,
  afterScreenshot: string
): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return true; // Optimistisch wenn kein Key

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "BEFORE screenshot:" },
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: beforeScreenshot },
              },
              { type: "text", text: "AFTER screenshot:" },
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: afterScreenshot },
              },
              {
                type: "text",
                text: `Expected outcome: ${expectedOutcome}\n\nDid the action achieve the expected outcome? Answer ONLY "yes" or "no".`,
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return true;

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const answer = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .toLowerCase()
      .trim();

    return answer.includes("yes");
  } catch {
    return true; // Optimistisch bei Fehlern
  }
}

/* ── Login Flow ── */

interface LoginFields {
  usernameField: string;
  passwordField: string;
  formAction: string;
  csrfToken?: { name: string; value: string };
}

async function identifyLoginFields(html: string): Promise<LoginFields | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Analyze this HTML login form and return a JSON object with these exact fields:
- usernameField: the name attribute of the username/email input
- passwordField: the name attribute of the password input
- formAction: the form action URL (or "" if not found)
- csrfToken: { name, value } if a CSRF/hidden token input exists, or null

Return ONLY valid JSON, no explanation.

HTML (truncated):
${html.slice(0, 8000)}`,
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const text = data.content?.[0]?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as LoginFields;
  } catch {
    return null;
  }
}

interface LoginResult {
  success: boolean;
  error?: string;
}

async function performLogin(
  credentialId: string,
  agentId: string,
  httpSession: HttpBrowsingSession,
  steps: ComputerUseSessionStep[]
): Promise<LoginResult> {
  const cred = await getDecryptedCredential(credentialId, agentId);
  if (!cred) return { success: false, error: "Credential nicht gefunden" };

  const loginPage = await fetchPage(cred.loginUrl, httpSession);
  const fields = await identifyLoginFields(loginPage.html);
  if (!fields) {
    return { success: false, error: "Login-Formular konnte nicht analysiert werden" };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const formData = new URLSearchParams();
    formData.set(fields.usernameField, cred.username);
    formData.set(fields.passwordField, cred.password);
    if (fields.csrfToken) {
      formData.set(fields.csrfToken.name, fields.csrfToken.value);
    }

    const actionUrl = fields.formAction
      ? new URL(fields.formAction, cred.loginUrl).toString()
      : cred.loginUrl;

    const response = await safeFetch(actionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": serializeCookies(httpSession.cookies),
      },
      body: formData.toString(),
      redirect: "follow",
    });

    captureSetCookies(response, httpSession);
    const responseHtml = await response.text();
    const responseUrl = response.url || actionUrl;

    steps.push({
      stepIndex: steps.length,
      url: responseUrl,
      action: "navigate",
      actionDetail: `Login-Versuch ${attempt + 1} auf ${cred.serviceName}`,
      htmlSummary: extractHtmlSummary(responseHtml),
      screenshot: null,
      extractedData: null,
      timestamp: new Date().toISOString(),
      durationMs: 0,
    });

    const lowerHtml = responseHtml.toLowerCase();
    const hasLoginForm = lowerHtml.includes('type="password"');
    const hasError = lowerHtml.includes("invalid") || lowerHtml.includes("incorrect") || lowerHtml.includes("failed");
    const redirectedAway = responseUrl !== cred.loginUrl;

    if (!hasLoginForm && (redirectedAway || !hasError)) {
      await markCredentialUsed(credentialId);
      return { success: true };
    }

    if (attempt === 0) {
      const freshPage = await fetchPage(cred.loginUrl, httpSession);
      const freshFields = await identifyLoginFields(freshPage.html);
      if (freshFields?.csrfToken) {
        fields.csrfToken = freshFields.csrfToken;
      }
    }
  }

  return { success: false, error: `Login bei ${cred.serviceName} fehlgeschlagen nach 2 Versuchen` };
}

/* ── Real Browser Execution Loop (V2.0) ── */

async function executeWithRealBrowser(
  task: string,
  startUrl: string,
  maxSteps: number,
  captureScreenshots: boolean,
  enableCodeExecution: boolean = false,
  executionId?: string,
  enableVerification: boolean = true,
  enableProceduralMemory: boolean = true,
  agentId?: string,
): Promise<{
  steps: ComputerUseSessionStep[];
  summary: string;
  extractedData: Record<string, unknown> | null;
  completionReason: ComputerUseSession["completionReason"];
  sessionId: string;
  reasoningLog?: unknown[];
  verificationLog?: unknown[];
  reliabilityStats?: Record<string, unknown>;
}> {
  const browserSession = createBrowserSession();
  const steps: ComputerUseSessionStep[] = [];
  let currentUrl = startUrl;
  let finalSummary = "";
  let finalExtractedData: Record<string, unknown> | null = null;
  let completionReason: ComputerUseSession["completionReason"] = "max_steps";

  // Reasoning Logger + Step Verifier
  const reasoningLogger = new ReasoningLogger();
  const stepVerifier = new StepVerifier(enableVerification && captureScreenshots);

  // Reliability V2: neue Systeme initialisieren
  const elementFinder = new ElementFinder();
  const screenshotStrategy = new ScreenshotStrategy();
  const actionExecutor = new ActionExecutor(elementFinder);
  const domVerifier = new DomVerifier();
  const pageCache = new PageCache();
  const metrics = new ReliabilityMetrics();

  // Procedural Memory: bekannte Prozedur als Prompt-Hint
  let proceduralHint = "";
  if (enableProceduralMemory && agentId) {
    try {
      const procedure = await findProcedure(agentId, startUrl, task);
      if (procedure) {
        proceduralHint = procedureToPromptHint(procedure);
      }
    } catch {
      // Fehler ignorieren — Procedural Memory ist optional
    }
  }

  // Page Cache: bekannte Struktur als Prompt-Hint
  const cachedStructure = pageCache.getCachedStructure(startUrl);
  if (cachedStructure) {
    proceduralHint += pageCache.structureToPromptHint(cachedStructure);
  }

  let lastContent = ""; // HTML-Content für DOM-basierte Operationen

  try {
    for (let i = 0; i < maxSteps; i++) {
      const stepStart = Date.now();
      const previousUrl = currentUrl;

      // 1. Navigieren und Content holen
      const { content, screenshot: navScreenshot } = await browserNavigate(browserSession, currentUrl);
      const htmlSummary = extractHtmlSummary(content);
      lastContent = content;

      // 2. Screenshot-Strategie: nur wenn nötig
      let screenshot = navScreenshot;
      if (!screenshot && captureScreenshots) {
        const ssDecision = i === 0
          ? { shouldCapture: true, reason: "Initial" }
          : screenshotStrategy.shouldTakeScreenshot(
              steps[steps.length - 1]?.action || "navigate",
              undefined,
            );

        if (ssDecision.shouldCapture) {
          screenshot = await takeBrowserScreenshot(browserSession, currentUrl);
          metrics.recordScreenshotTaken();
        } else {
          metrics.recordScreenshotSkipped();
        }
      }

      // 3. Claude Vision oder Text-basiert fragen
      let claudeAction: ClaudeAction;
      const thinkStart = Date.now();

      if (screenshot) {
        claudeAction = await askClaudeWithVision(
          task,
          currentUrl,
          screenshot,
          steps,
          true, // Browser-Modus
          enableCodeExecution,
          proceduralHint,
        );
      } else {
        claudeAction = await askClaudeForAction(
          task, currentUrl, content, htmlSummary, steps, false, "", false
        );
      }

      const thinkDuration = Date.now() - thinkStart;

      // Reasoning loggen
      reasoningLogger.logFromClaudeAction(
        i,
        claudeAction.action,
        claudeAction.reasoning,
        claudeAction.selector || claudeAction.url,
        thinkDuration,
        screenshot ? `step_${i}` : undefined,
      );

      const domain = (() => { try { return new URL(currentUrl).hostname; } catch { return currentUrl; } })();

      // 4. Aktion ausführen — mit Multi-Strategy-Executor
      switch (claudeAction.action) {
        case "done": {
          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "done",
            actionDetail: claudeAction.reasoning,
            htmlSummary,
            screenshot,
            extractedData: claudeAction.extracted_data || null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
          });

          finalSummary = claudeAction.summary || "";
          finalExtractedData = claudeAction.extracted_data || null;
          completionReason = "done";
          break;
        }

        case "navigate": {
          if (claudeAction.url) {
            try {
              currentUrl = new URL(claudeAction.url, currentUrl).href;
            } catch {
              currentUrl = claudeAction.url;
            }
          }

          // DOM-Verification: prüfe ob Navigation erfolgreich war
          const navVerify = await domVerifier.verifyNavigation(browserSession, currentUrl);
          if (navVerify.conclusive && !navVerify.verified) {
            metrics.record({ domain, actionType: "navigate", strategy: "direct", success: false, durationMs: Date.now() - stepStart, creditsCost: 0 });
          } else {
            metrics.record({ domain, actionType: "navigate", strategy: "direct", success: true, durationMs: Date.now() - stepStart, creditsCost: 0 });
            metrics.recordDomVerification();
          }

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "navigate",
            actionDetail: `Navigiere zu: ${claudeAction.url} — ${claudeAction.reasoning}`,
            htmlSummary,
            screenshot,
            extractedData: null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
            verified: navVerify.verified,
          });
          continue;
        }

        case "click": {
          if (claudeAction.selector) {
            // Multi-Strategy Click via ActionExecutor
            const clickResult = await actionExecutor.executeClick(
              browserSession, currentUrl, claudeAction.selector, lastContent,
            );

            // DOM-Verification statt Vision
            let verified = clickResult.success;
            if (clickResult.success && enableVerification) {
              const domCheck = await domVerifier.verifyClick(browserSession, clickResult.newUrl || currentUrl, previousUrl);
              if (domCheck.conclusive) {
                verified = domCheck.verified;
                metrics.recordDomVerification();
              } else if (stepVerifier.shouldVerify("click") && screenshot && captureScreenshots) {
                // Fallback: Vision-Verification nur wenn DOM inconclusive
                const afterScreenshot = await takeBrowserScreenshot(browserSession, clickResult.newUrl || currentUrl);
                if (afterScreenshot && screenshot) {
                  const verResult = await stepVerifier.verify(
                    i, "click",
                    `Clicked "${claudeAction.selector}" — ${claudeAction.reasoning}`,
                    screenshot, afterScreenshot,
                  );
                  verified = verResult.success;
                  metrics.recordVisionVerification();
                  reasoningLogger.addVerificationResult(i, {
                    success: verResult.success,
                    confidence: verResult.confidence,
                    issue: verResult.issue,
                  });
                }
              }
            }

            if (clickResult.newUrl) currentUrl = clickResult.newUrl;

            metrics.record({
              domain, actionType: "click", strategy: clickResult.methodUsed,
              success: verified, durationMs: clickResult.timeMs, creditsCost: 0,
            });

            steps.push({
              stepIndex: i,
              url: currentUrl,
              action: "click",
              actionDetail: `Click: "${claudeAction.selector}" [${clickResult.methodUsed}] — ${claudeAction.reasoning}`,
              htmlSummary,
              screenshot,
              extractedData: null,
              timestamp: new Date().toISOString(),
              durationMs: Date.now() - stepStart,
              verified,
            });

            if (!verified && i < maxSteps - 1) {
              continue;
            }
          }
          continue;
        }

        case "type": {
          if (claudeAction.selector && claudeAction.text) {
            // Multi-Strategy Type via ActionExecutor
            const typeResult = await actionExecutor.executeType(
              browserSession, currentUrl, claudeAction.selector, claudeAction.text, lastContent,
            );

            // DOM-Verification: Wert prüfen
            let verified = typeResult.success;
            if (typeResult.success && enableVerification) {
              const typeCheck = await domVerifier.verifyType(
                browserSession, currentUrl, claudeAction.selector, claudeAction.text,
              );
              if (typeCheck.conclusive) {
                verified = typeCheck.verified;
                metrics.recordDomVerification();
              }
            }

            metrics.record({
              domain, actionType: "type", strategy: typeResult.methodUsed,
              success: verified, durationMs: typeResult.timeMs, creditsCost: 0,
            });

            steps.push({
              stepIndex: i,
              url: currentUrl,
              action: "type",
              actionDetail: `Type: "${claudeAction.text}" in ${claudeAction.selector} [${typeResult.methodUsed}] — ${claudeAction.reasoning}`,
              htmlSummary,
              screenshot,
              extractedData: null,
              timestamp: new Date().toISOString(),
              durationMs: Date.now() - stepStart,
              verified,
            });
          }
          continue;
        }

        case "scroll": {
          const scrollResult = await actionExecutor.executeScroll(
            browserSession, currentUrl,
            claudeAction.direction || "down",
            claudeAction.pixels || 500,
          );

          metrics.record({
            domain, actionType: "scroll", strategy: "browserless",
            success: scrollResult.success, durationMs: scrollResult.timeMs, creditsCost: 0,
          });

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "scroll",
            actionDetail: `Scroll ${claudeAction.direction || "down"} ${claudeAction.pixels || 500}px — ${claudeAction.reasoning}`,
            htmlSummary,
            screenshot,
            extractedData: null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
          });
          continue;
        }

        case "click_link": {
          const resolvedUrl = claudeAction.selector
            ? resolveLink(content, claudeAction.selector, currentUrl)
            : null;

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "click_link",
            actionDetail: `Klicke: "${claudeAction.selector}" → ${resolvedUrl || "nicht gefunden"} — ${claudeAction.reasoning}`,
            htmlSummary,
            screenshot,
            extractedData: null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
          });

          if (resolvedUrl) currentUrl = resolvedUrl;
          continue;
        }

        case "extract_data": {
          // Multi-Strategy Extraktion via ActionExecutor
          const extractResult = await actionExecutor.executeExtract(
            browserSession, currentUrl, claudeAction.fields || [], lastContent,
          );

          const extracted = (extractResult.result as Record<string, unknown>) || {};

          // DOM-Plausibilitätsprüfung
          if (claudeAction.fields) {
            const dataCheck = domVerifier.verifyDataExtraction(extracted, claudeAction.fields);
            metrics.recordDomVerification();
            if (!dataCheck.verified) {
              // Bei Plausibilitätsproblemen: in actionDetail vermerken
              const issues = (dataCheck.details.issues as string[]) || [];
              if (issues.length > 0) {
                console.warn(`[ComputerUse] Data extraction issues: ${issues.join(", ")}`);
              }
            }
          }

          metrics.record({
            domain, actionType: "extract", strategy: extractResult.methodUsed,
            success: extractResult.success, durationMs: extractResult.timeMs, creditsCost: 0,
          });

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "extract_data",
            actionDetail: `Extrahiere: ${(claudeAction.fields || []).join(", ")} [${extractResult.methodUsed}] — ${claudeAction.reasoning}`,
            htmlSummary,
            screenshot,
            extractedData: extracted,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
          });

          if (!finalExtractedData) finalExtractedData = {};
          Object.assign(finalExtractedData, extracted);
          continue;
        }

        case "execute_code": {
          if (!enableCodeExecution || !claudeAction.code) {
            steps.push({
              stepIndex: i,
              url: currentUrl,
              action: "analyze",
              actionDetail: `Code-Ausführung übersprungen (${!enableCodeExecution ? "deaktiviert" : "kein Code"}) — ${claudeAction.reasoning}`,
              htmlSummary,
              screenshot,
              extractedData: null,
              timestamp: new Date().toISOString(),
              durationMs: Date.now() - stepStart,
            });
            continue;
          }

          const execId = executionId || browserSession.id;
          const codeLang = claudeAction.code_language || "python";
          const codeResult = codeLang === "javascript"
            ? await executeJavascript(execId, claudeAction.code)
            : await executePython(execId, claudeAction.code);

          const codeExtracted: Record<string, unknown> = {};
          if (codeResult.output) {
            codeExtracted._codeOutput = codeResult.output;
          }

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "execute_code",
            actionDetail: `${codeLang}: ${claudeAction.reasoning}\n${codeResult.success ? "✓ Erfolgreich" : "✗ Fehler: " + (codeResult.error || "")}`,
            htmlSummary,
            screenshot,
            extractedData: Object.keys(codeExtracted).length > 0 ? codeExtracted : null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
          });

          if (codeResult.output && !finalExtractedData) finalExtractedData = {};
          if (codeResult.output && finalExtractedData) {
            finalExtractedData._codeOutput = codeResult.output;
          }
          continue;
        }

        default: {
          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "analyze",
            actionDetail: claudeAction.reasoning,
            htmlSummary,
            screenshot,
            extractedData: null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
          });
          continue;
        }
      }

      if (completionReason === "done") break;
    }
  } finally {
    closeBrowserSession(browserSession.id);
    if (enableCodeExecution && executionId) {
      await cleanupCodeSession(executionId).catch(() => {});
    }

    // Procedural Memory: Prozedur speichern/aktualisieren
    if (enableProceduralMemory && agentId && steps.length >= 2) {
      saveProcedure(
        agentId, startUrl, task, steps,
        completionReason === "done",
      ).catch(() => {});
    }

    // Reliability Metrics: non-blocking persistieren
    if (agentId && executionId) {
      metrics.persistMetrics(agentId, executionId).catch(() => {});
    }
  }

  // Reliability-Statistiken für Meta
  const sessionStats = metrics.getSessionStats();
  const efStats = elementFinder.getStats();
  const ssStats = screenshotStrategy.getStats();
  const dvStats = domVerifier.getStats();

  return {
    steps,
    summary: finalSummary || `${steps.length} Schritte ausgeführt`,
    extractedData: finalExtractedData,
    completionReason,
    sessionId: browserSession.id,
    reasoningLog: reasoningLogger.toJSON(),
    verificationLog: stepVerifier.getLog(),
    reliabilityStats: {
      screenshotsSkipped: ssStats.skipped,
      screenshotsTaken: ssStats.taken,
      domVerifications: dvStats.domVerified,
      visionVerifications: sessionStats.visionVerifications,
      elementFinderStats: efStats,
      creditsSaved: sessionStats.creditsSaved,
      actionExecutorStats: actionExecutor.getStats(),
    },
  };
}

/* ── Main Executor ── */

export async function executeComputerUse(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const task = resolveExpression(String(config.task || ""), context);
  const startUrl = resolveExpression(String(config.startUrl || ""), context);
  const maxSteps = Math.min(Number(config.maxSteps) || 10, MAX_LOOP_STEPS);
  const captureScreenshots = config.captureScreenshots !== false;
  const extractData = config.extractData === true;
  const dataSchema = String(config.dataSchema || "");
  const resultKey = String(config.resultKey || "computerUseResult");
  const requiresLogin = config.requiresLogin === true;
  const credentialId = String(config.credentialId || "");
  const agentId = String(context._agentId || "");
  const useBrowserMode = config.browserMode !== "http" && isBrowserServiceAvailable();
  const enableCodeExecution = config.enableCodeExecution === true && isCodeSandboxAvailable();
  const enableVerification = config.enableVerification !== false; // Default: true
  const enableProceduralMemory = config.enableProceduralMemory !== false; // Default: true

  if (!task) {
    return { contextDelta: {}, success: false, error: "Aufgabe fehlt" };
  }
  if (!startUrl) {
    return { contextDelta: {}, success: false, error: "Start-URL fehlt" };
  }

  const preferMCPOverBrowser = config.preferMCPOverBrowser !== false; // Default: true
  const sessionStart = Date.now();

  try {
    // MCP Hybrid Routing: Prüfe ob ein MCP-Server die Aufgabe erledigen kann
    if (preferMCPOverBrowser && agentId) {
      try {
        const routeDecision = await routeAction(agentId, task, startUrl, true);
        if (routeDecision.method === "mcp" && routeDecision.tool) {
          const mcpResult = await executeMCPTool(
            agentId,
            routeDecision.tool,
            { task, url: startUrl },
          );

          return {
            contextDelta: {
              [resultKey]: JSON.parse(mcpResult),
              [`${resultKey}_routing`]: {
                method: "mcp",
                server: routeDecision.server,
                tool: routeDecision.tool,
                reasoning: routeDecision.reasoning,
                estimatedCreditsSaved: routeDecision.estimatedCreditsSaved,
                durationMs: Date.now() - sessionStart,
              },
            },
            success: true,
            meta: {
              routedViaMCP: true,
              mcpServer: routeDecision.server,
              mcpTool: routeDecision.tool,
              totalDurationMs: Date.now() - sessionStart,
            },
          };
        }
      } catch {
        // MCP-Routing fehlgeschlagen — Fallback zu Browser-Modus
      }
    }

    // V2.0: Real Browser Mode
    if (useBrowserMode && !requiresLogin) {
      const result = await executeWithRealBrowser(
        task, startUrl, maxSteps, captureScreenshots,
        enableCodeExecution, String(context._executionId || ""),
        enableVerification, enableProceduralMemory, agentId,
      );

      const cuSession: ComputerUseSession = {
        task,
        startUrl,
        steps: result.steps,
        summary: result.summary,
        extractedData: result.extractedData,
        totalDurationMs: Date.now() - sessionStart,
        urlsVisited: Array.from(new Set(result.steps.map((s) => s.url))),
        screenshotsAvailable: result.steps.some((s) => !!s.screenshot),
        completionReason: result.completionReason,
        browserMode: "real",
        sessionId: result.sessionId,
      };

      return {
        contextDelta: {
          [resultKey]: cuSession,
          [`${resultKey}_reasoning`]: result.reasoningLog,
          [`${resultKey}_verification`]: result.verificationLog,
        },
        success: true,
        meta: {
          stepsCount: result.steps.length,
          urlsVisited: cuSession.urlsVisited,
          totalDurationMs: cuSession.totalDurationMs,
          model: VISION_MODEL,
          hasExtractedData: !!result.extractedData,
          screenshotsAvailable: cuSession.screenshotsAvailable,
          completionReason: result.completionReason,
          browserMode: "real",
          sessionId: result.sessionId,
          reasoningEntries: Array.isArray(result.reasoningLog) ? result.reasoningLog.length : 0,
          verificationEntries: Array.isArray(result.verificationLog) ? result.verificationLog.length : 0,
          reliabilityStats: result.reliabilityStats,
        },
      };
    }

    // V1.0 Fallback: HTTP-Modus
    const steps: ComputerUseSessionStep[] = [];
    let currentUrl = startUrl;
    let screenshotsAvailable = false;
    let finalSummary = "";
    let finalExtractedData: Record<string, unknown> | null = null;
    let completionReason: ComputerUseSession["completionReason"] = "max_steps";
    const httpSession = createHttpSession();

    // Login-Flow wenn aktiviert
    if (requiresLogin && credentialId && agentId) {
      const loginResult = await performLogin(credentialId, agentId, httpSession, steps);
      if (!loginResult.success) {
        return {
          contextDelta: {
            [resultKey]: {
              task,
              startUrl,
              steps,
              summary: loginResult.error || "Login fehlgeschlagen",
              extractedData: null,
              totalDurationMs: Date.now() - sessionStart,
              urlsVisited: Array.from(new Set(steps.map((s) => s.url))),
              screenshotsAvailable: false,
              completionReason: "error" as const,
              browserMode: "http",
            },
          },
          success: false,
          error: loginResult.error || "Login fehlgeschlagen",
        };
      }
    }

    for (let i = 0; i < maxSteps; i++) {
      const stepStart = Date.now();

      const page = await fetchPage(currentUrl, httpSession);
      currentUrl = page.finalUrl;
      const htmlSummary = extractHtmlSummary(page.html);

      let screenshot: string | null = null;
      if (captureScreenshots) {
        screenshot = await takeScreenshot(currentUrl);
        if (screenshot) screenshotsAvailable = true;
      }

      const claudeAction = await askClaudeForAction(
        task, currentUrl, page.html, htmlSummary,
        steps, extractData, dataSchema, !!screenshot,
      );

      switch (claudeAction.action) {
        case "done": {
          steps.push({
            stepIndex: i, url: currentUrl, action: "done",
            actionDetail: claudeAction.reasoning, htmlSummary, screenshot,
            extractedData: claudeAction.extracted_data || null,
            timestamp: new Date().toISOString(), durationMs: Date.now() - stepStart,
          });
          finalSummary = claudeAction.summary || "";
          finalExtractedData = claudeAction.extracted_data || null;
          completionReason = "done";
          break;
        }

        case "navigate": {
          steps.push({
            stepIndex: i, url: currentUrl, action: "navigate",
            actionDetail: `Navigiere zu: ${claudeAction.url} — ${claudeAction.reasoning}`,
            htmlSummary, screenshot, extractedData: null,
            timestamp: new Date().toISOString(), durationMs: Date.now() - stepStart,
          });
          if (claudeAction.url) {
            try { currentUrl = new URL(claudeAction.url, currentUrl).href; }
            catch { currentUrl = claudeAction.url; }
          } else {
            completionReason = "no_next_url";
            break;
          }
          continue;
        }

        case "click_link": {
          const resolvedUrl = claudeAction.selector
            ? resolveLink(page.html, claudeAction.selector, currentUrl)
            : null;
          steps.push({
            stepIndex: i, url: currentUrl, action: "click_link",
            actionDetail: `Klicke: "${claudeAction.selector}" → ${resolvedUrl || "nicht gefunden"} — ${claudeAction.reasoning}`,
            htmlSummary, screenshot, extractedData: null,
            timestamp: new Date().toISOString(), durationMs: Date.now() - stepStart,
          });
          if (resolvedUrl) currentUrl = resolvedUrl;
          continue;
        }

        case "extract_data": {
          const extracted = claudeAction.fields
            ? extractDataFromHtml(page.html, claudeAction.fields) : {};
          steps.push({
            stepIndex: i, url: currentUrl, action: "extract_data",
            actionDetail: `Extrahiere: ${(claudeAction.fields || []).join(", ")} — ${claudeAction.reasoning}`,
            htmlSummary, screenshot, extractedData: extracted,
            timestamp: new Date().toISOString(), durationMs: Date.now() - stepStart,
          });
          if (!finalExtractedData) finalExtractedData = {};
          Object.assign(finalExtractedData, extracted);
          continue;
        }

        default: {
          steps.push({
            stepIndex: i, url: currentUrl, action: "analyze",
            actionDetail: claudeAction.reasoning, htmlSummary, screenshot,
            extractedData: null,
            timestamp: new Date().toISOString(), durationMs: Date.now() - stepStart,
          });
          continue;
        }
      }

      if (completionReason === "done" || completionReason === "no_next_url") break;
    }

    const cuSession: ComputerUseSession = {
      task, startUrl, steps,
      summary: finalSummary || `${steps.length} Schritte ausgeführt`,
      extractedData: finalExtractedData,
      totalDurationMs: Date.now() - sessionStart,
      urlsVisited: Array.from(new Set(steps.map((s) => s.url))),
      screenshotsAvailable,
      completionReason,
      browserMode: "http",
    };

    return {
      contextDelta: { [resultKey]: cuSession },
      success: true,
      meta: {
        stepsCount: steps.length,
        urlsVisited: cuSession.urlsVisited,
        totalDurationMs: cuSession.totalDurationMs,
        model: COMPUTER_USE_MODEL,
        hasExtractedData: !!finalExtractedData,
        screenshotsAvailable,
        completionReason,
        browserMode: "http",
      },
    };
  } catch (err) {
    return {
      contextDelta: {
        [resultKey]: {
          task, startUrl, steps: [],
          summary: err instanceof Error ? err.message : "Fehler aufgetreten",
          extractedData: null,
          totalDurationMs: Date.now() - sessionStart,
          urlsVisited: [],
          screenshotsAvailable: false,
          completionReason: "error",
          browserMode: useBrowserMode ? "real" : "http",
        },
      },
      success: false,
      error: err instanceof Error ? err.message : "Computer Use fehlgeschlagen",
      meta: { partialSession: true },
    };
  }
}
