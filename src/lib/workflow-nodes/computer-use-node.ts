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
  clickBrowserCoordinates,
  getCurrentBrowserUrl,
  getPageContent as getBrowserPageContent,
  takeBrowserScreenshot,
  typeTextInFocusedElement,
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
import { ReasoningLogger } from "@/lib/sandbox/reasoning-logger";
import {
  findProcedure,
  saveProcedure,
  procedureToPromptHint,
} from "@/lib/sandbox/procedural-memory";
import { routeAction } from "@/lib/mcp/hybrid-router";
import { executeMCPTool } from "@/lib/mcp/mcp-tool-bridge";
import { ElementFinder } from "@/lib/browser/element-finder";
import { ActionExecutor } from "@/lib/browser/action-executor";
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
  browserBackend?: string;
  warning?: string;
  sessionId?: string; // Browser Session ID für Live-View
}

/* ── Claude Action Response (V2.0 erweitert) ── */

interface ClaudeAction {
  action: "navigate" | "click_link" | "click" | "type" | "scroll" | "extract_data" | "extract" | "done" | "execute_code";
  url?: string;
  selector?: string;
  target?: string;
  x?: number;
  y?: number;
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

function toOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getClaudeActionTarget(action: ClaudeAction): string | undefined {
  return action.selector || action.target;
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
  htmlSummary: string = "",
): Promise<ClaudeAction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");

  const stepsContext = previousSteps.length > 0
    ? `\n\nBisherige Schritte:\n${previousSteps.map((s) =>
        `${s.stepIndex + 1}. [${s.action}] ${s.url} — ${s.actionDetail}${s.verified === false ? " ⚠️ NICHT VERIFIZIERT" : ""}`
      ).join("\n")}`
    : "";

  const codeActions = enableCodeExecution
    ? `

7. Code ausführen (Daten verarbeiten, Dateien erstellen, Berechnungen):
{"action": "execute_code", "code": "import pandas as pd\\nprint('Hello')", "code_language": "python", "reasoning": "Warum"}

Nutze Code-Ausführung wenn du Daten analysieren, transformieren, Diagramme erstellen oder Dateien generieren musst.`
    : "";

  const systemPrompt = `Du bist ein visueller Browser-Automations-Agent. Du steuerst einen echten Browser über Screenshots und Browser-Aktionen.

Aufgabe: ${task}
Aktuelle URL: ${currentUrl}
Seiten-Zusammenfassung: ${htmlSummary || "Keine"}
Browser-Modus: ${useBrowserMode ? "Echter Browser" : "HTTP-Fetching"}
${stepsContext}

Antworte AUSSCHLIESSLICH als JSON. Format:
{
  "action": "click|type|scroll|navigate|extract|done${enableCodeExecution ? "|execute_code" : ""}",
  "target": "kurze Beschreibung des Elements oder Ziels",
  "selector": "optionaler CSS-Selektor wenn klar erkennbar",
  "x": 123,
  "y": 456,
  "text": "einzutippender Text",
  "direction": "up|down",
  "pixels": 500,
  "url": "https://...",
  "fields": ["price", "title"],
  "summary": "kurze Zusammenfassung",
  "extracted_data": {},
  "reasoning": "warum diese Aktion"
}

Aktionen:
1. click: Klicke auf ein sichtbares Element. Gib wenn möglich x/y an. Füge target oder selector hinzu, wenn du das Element benennen kannst.
2. type: Tippe Text in das aktuell fokussierte Feld oder in ein erkennbares Feld. Gib text an. Wenn du das Feld lokalisieren kannst, gib x/y und/oder target/selector mit.
3. scroll: Scrolle die Seite.
4. navigate: Nur wenn du wirklich eine neue URL öffnen musst.
5. extract: Wenn die Antwort bereits sichtbar ist. Gib extracted_data und optional fields an.
6. done: Wenn die Aufgabe vollständig abgeschlossen ist. Gib summary und extracted_data an.
${codeActions}
${proceduralHint}

Regeln:
- Bevorzuge Aktionen auf der aktuellen Seite statt unnötiger Navigation.
- Nutze target/selector als DOM-Hinweis, falls erkennbar.
- Für click/type auf sichtbare UI verwende bevorzugt x/y.
- "extract" und "done" sind terminale Aktionen.
- Gib NUR JSON zurück, keinen Fließtext.`;

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
              text: `Aufgabe: ${task}\n\nSchritt ${previousSteps.length + 1}. Analysiere den Screenshot und entscheide die nächste Browser-Aktion.`,
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
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ClaudeAction> & {
      params?: Record<string, unknown>;
      result?: string;
      data?: Record<string, unknown>;
    };
    const params = typeof parsed.params === "object" && parsed.params
      ? parsed.params
      : {};
    const rawAction = String(parsed.action || params.action || "done");
    const normalizedAction = rawAction === "extract"
      ? "extract_data"
      : rawAction;
    return {
      action: (normalizedAction as ClaudeAction["action"]) || "done",
      url: String(parsed.url || params.url || "") || undefined,
      selector: String(parsed.selector || params.selector || "") || undefined,
      target: String(parsed.target || params.target || "") || undefined,
      x: toOptionalNumber(parsed.x ?? params.x),
      y: toOptionalNumber(parsed.y ?? params.y),
      text: String(parsed.text || params.text || "") || undefined,
      direction: ((parsed.direction || params.direction) as "up" | "down" | undefined),
      pixels: toOptionalNumber(parsed.pixels ?? params.pixels),
      fields: Array.isArray(parsed.fields)
        ? parsed.fields.map(String)
        : Array.isArray(params.fields)
          ? params.fields.map(String)
          : undefined,
      summary: String(parsed.summary || params.summary || parsed.result || params.result || "") || undefined,
      extracted_data: (parsed.extracted_data ||
        params.extracted_data ||
        parsed.data ||
        params.data) as Record<string, unknown> | undefined,
      reasoning: parsed.reasoning || "",
      code: typeof parsed.code === "string" ? parsed.code : undefined,
      code_language: parsed.code_language,
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

type ComputerUseProgressCallback = (message: string) => void;

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

function describeComputerUseAction(action: ClaudeAction): string {
  switch (action.action) {
    case "navigate":
      return action.url
        ? `Navigating to ${action.url}...`
        : "Navigating to the next page...";
    case "click":
      return getClaudeActionTarget(action)
        ? `Clicking ${getClaudeActionTarget(action)}...`
        : action.x !== undefined && action.y !== undefined
          ? `Clicking at ${action.x}, ${action.y}...`
          : "Clicking the next element...";
    case "type":
      return action.text
        ? `Typing "${action.text.slice(0, 60)}"...`
        : getClaudeActionTarget(action)
          ? `Typing into ${getClaudeActionTarget(action)}...`
          : "Typing into the page...";
    case "scroll":
      return `Scrolling ${action.direction || "down"}...`;
    case "extract_data":
    case "extract":
      return action.fields?.length
        ? `Extracting ${action.fields.join(", ")}...`
        : "Extracting data from the page...";
    case "click_link":
      return action.selector
        ? `Opening "${action.selector}"...`
        : "Opening the next link...";
    case "execute_code":
      return "Processing page data...";
    case "done":
      return action.summary || "Task completed.";
    default:
      return action.reasoning || "Analyzing the page...";
  }
}

/* ── Real Browser Execution Loop (V2.0) ── */

async function executeWithRealBrowser(
  task: string,
  startUrl: string,
  maxSteps: number,
  captureScreenshots: boolean,
  enableCodeExecution: boolean = false,
  executionId?: string,
  enableProceduralMemory: boolean = true,
  agentId?: string,
  onProgress?: ComputerUseProgressCallback,
): Promise<{
  steps: ComputerUseSessionStep[];
  summary: string;
  extractedData: Record<string, unknown> | null;
  completionReason: ComputerUseSession["completionReason"];
  sessionId: string;
  browserBackend: string;
  warning?: string;
  reasoningLog?: unknown[];
  verificationLog?: unknown[];
  reliabilityStats?: Record<string, unknown>;
}> {
  const browserSession = await createBrowserSession();
  const steps: ComputerUseSessionStep[] = [];
  let currentUrl = startUrl;
  let finalSummary = "";
  let finalExtractedData: Record<string, unknown> | null = null;
  let completionReason: ComputerUseSession["completionReason"] = "max_steps";

  const reasoningLogger = new ReasoningLogger();
  const elementFinder = new ElementFinder();
  const actionExecutor = new ActionExecutor(elementFinder);
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
    onProgress?.(`Launching ${browserSession.backend.toUpperCase()} browser session...`);
    if (browserSession.warning) {
      onProgress?.(browserSession.warning);
    }

    const initialPage = await browserNavigate(browserSession, startUrl, { timeout: 30000 });
    currentUrl = await getCurrentBrowserUrl(browserSession).catch(() => startUrl);
    lastContent = initialPage.content;

    for (let i = 0; i < maxSteps; i++) {
      const stepStart = Date.now();
      currentUrl = await getCurrentBrowserUrl(browserSession).catch(() => currentUrl);
      lastContent = await getBrowserPageContent(browserSession, currentUrl).catch(() => lastContent);
      const htmlSummary = extractHtmlSummary(lastContent);

      let screenshot: string | null = null;
      if (captureScreenshots) {
        screenshot = await takeBrowserScreenshot(browserSession);
        if (screenshot) metrics.recordScreenshotTaken();
        else metrics.recordScreenshotSkipped();
      }

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
          htmlSummary,
        );
      } else {
        claudeAction = await askClaudeForAction(
          task, currentUrl, lastContent, htmlSummary, steps, false, "", false
        );
      }

      const thinkDuration = Date.now() - thinkStart;

      // Reasoning loggen
      reasoningLogger.logFromClaudeAction(
        i,
        claudeAction.action,
        claudeAction.reasoning,
        getClaudeActionTarget(claudeAction) || claudeAction.url,
        thinkDuration,
        screenshot ? `step_${i}` : undefined,
      );

      const domain = (() => { try { return new URL(currentUrl).hostname; } catch { return currentUrl; } })();
      onProgress?.(`Step ${i + 1}: ${describeComputerUseAction(claudeAction)}`);

      let proofScreenshot = screenshot;
      let stepHtmlSummary = htmlSummary;

      switch (claudeAction.action) {
        case "done": {
          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "done",
            actionDetail: claudeAction.reasoning,
            htmlSummary: stepHtmlSummary,
            screenshot: proofScreenshot,
            extractedData: claudeAction.extracted_data || null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
          });

          finalSummary = claudeAction.summary || claudeAction.reasoning || "Task completed.";
          finalExtractedData = claudeAction.extracted_data || null;
          completionReason = "done";
          break;
        }

        case "navigate": {
          if (!claudeAction.url) {
            completionReason = "no_next_url";
            break;
          }

          try {
            currentUrl = new URL(claudeAction.url, currentUrl).href;
          } catch {
            currentUrl = claudeAction.url;
          }

          const navigated = await browserNavigate(browserSession, currentUrl, { timeout: 30000 });
          currentUrl = await getCurrentBrowserUrl(browserSession).catch(() => currentUrl);
          lastContent = navigated.content;
          stepHtmlSummary = extractHtmlSummary(lastContent);
          proofScreenshot = navigated.screenshot || (captureScreenshots ? await takeBrowserScreenshot(browserSession) : screenshot);

          metrics.record({
            domain,
            actionType: "navigate",
            strategy: browserSession.backend,
            success: true,
            durationMs: Date.now() - stepStart,
            creditsCost: 0,
          });

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "navigate",
            actionDetail: `Navigiere zu: ${claudeAction.url} — ${claudeAction.reasoning}`,
            htmlSummary: stepHtmlSummary,
            screenshot: proofScreenshot,
            extractedData: null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
            verified: true,
          });
          continue;
        }

        case "click": {
          const target = getClaudeActionTarget(claudeAction);
          let clickSuccess = false;
          let methodUsed = "vision_coordinates";
          let newUrl: string | undefined;

          if (target) {
            const clickResult = await actionExecutor.executeClick(
              browserSession,
              currentUrl,
              target,
              lastContent,
            );
            clickSuccess = clickResult.success;
            methodUsed = clickResult.methodUsed;
            newUrl = clickResult.newUrl;
          }

          if (!clickSuccess && claudeAction.x !== undefined && claudeAction.y !== undefined) {
            const coordinateResult = await clickBrowserCoordinates(
              browserSession,
              claudeAction.x,
              claudeAction.y
            );
            clickSuccess = coordinateResult.success;
            methodUsed = "vision_coordinates";
            newUrl = coordinateResult.newUrl;
          }

          currentUrl = newUrl || await getCurrentBrowserUrl(browserSession).catch(() => currentUrl);
          lastContent = await getBrowserPageContent(browserSession, currentUrl).catch(() => lastContent);
          stepHtmlSummary = extractHtmlSummary(lastContent);
          proofScreenshot = captureScreenshots ? await takeBrowserScreenshot(browserSession) : screenshot;

          metrics.record({
            domain,
            actionType: "click",
            strategy: methodUsed,
            success: clickSuccess,
            durationMs: Date.now() - stepStart,
            creditsCost: 0,
          });

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "click",
            actionDetail: `Click: "${target || `${claudeAction.x},${claudeAction.y}`}" [${methodUsed}] — ${claudeAction.reasoning}`,
            htmlSummary: stepHtmlSummary,
            screenshot: proofScreenshot,
            extractedData: null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
            verified: clickSuccess,
          });
          continue;
        }

        case "type": {
          if (!claudeAction.text) {
            steps.push({
              stepIndex: i,
              url: currentUrl,
              action: "analyze",
              actionDetail: `Typing requested without text — ${claudeAction.reasoning}`,
              htmlSummary: stepHtmlSummary,
              screenshot: proofScreenshot,
              extractedData: null,
              timestamp: new Date().toISOString(),
              durationMs: Date.now() - stepStart,
            });
            continue;
          }

          const target = getClaudeActionTarget(claudeAction);
          let typeSuccess = false;
          let methodUsed = "focused_type";

          if (target) {
            const typeResult = await actionExecutor.executeType(
              browserSession,
              currentUrl,
              target,
              claudeAction.text,
              lastContent,
            );
            typeSuccess = typeResult.success;
            methodUsed = typeResult.methodUsed;
          }

          if (!typeSuccess && claudeAction.x !== undefined && claudeAction.y !== undefined) {
            const focusResult = await clickBrowserCoordinates(
              browserSession,
              claudeAction.x,
              claudeAction.y
            );
            if (focusResult.success) {
              const focusedType = await typeTextInFocusedElement(browserSession, claudeAction.text);
              typeSuccess = focusedType.success;
              methodUsed = "vision_coordinates+focused_type";
            }
          }

          if (!typeSuccess) {
            const focusedType = await typeTextInFocusedElement(browserSession, claudeAction.text, currentUrl);
            typeSuccess = focusedType.success;
            methodUsed = target ? `${methodUsed}+focused_type` : "focused_type";
          }

          currentUrl = await getCurrentBrowserUrl(browserSession).catch(() => currentUrl);
          lastContent = await getBrowserPageContent(browserSession, currentUrl).catch(() => lastContent);
          stepHtmlSummary = extractHtmlSummary(lastContent);
          proofScreenshot = captureScreenshots ? await takeBrowserScreenshot(browserSession) : screenshot;

          metrics.record({
            domain,
            actionType: "type",
            strategy: methodUsed,
            success: typeSuccess,
            durationMs: Date.now() - stepStart,
            creditsCost: 0,
          });

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "type",
            actionDetail: `Type: "${claudeAction.text}" in ${target || `${claudeAction.x},${claudeAction.y}` || "focused element"} [${methodUsed}] — ${claudeAction.reasoning}`,
            htmlSummary: stepHtmlSummary,
            screenshot: proofScreenshot,
            extractedData: null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
            verified: typeSuccess,
          });
          continue;
        }

        case "scroll": {
          const scrollResult = await actionExecutor.executeScroll(
            browserSession,
            currentUrl,
            claudeAction.direction || "down",
            claudeAction.pixels || 500,
          );

          currentUrl = await getCurrentBrowserUrl(browserSession).catch(() => currentUrl);
          lastContent = await getBrowserPageContent(browserSession, currentUrl).catch(() => lastContent);
          stepHtmlSummary = extractHtmlSummary(lastContent);
          proofScreenshot = captureScreenshots ? await takeBrowserScreenshot(browserSession) : screenshot;

          metrics.record({
            domain,
            actionType: "scroll",
            strategy: browserSession.backend,
            success: scrollResult.success,
            durationMs: scrollResult.timeMs,
            creditsCost: 0,
          });

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "scroll",
            actionDetail: `Scroll ${claudeAction.direction || "down"} ${claudeAction.pixels || 500}px — ${claudeAction.reasoning}`,
            htmlSummary: stepHtmlSummary,
            screenshot: proofScreenshot,
            extractedData: null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
          });
          continue;
        }

        case "click_link": {
          const resolvedUrl = claudeAction.selector
            ? resolveLink(lastContent, claudeAction.selector, currentUrl)
            : null;

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "click_link",
            actionDetail: `Klicke: "${claudeAction.selector}" → ${resolvedUrl || "nicht gefunden"} — ${claudeAction.reasoning}`,
            htmlSummary: stepHtmlSummary,
            screenshot: proofScreenshot,
            extractedData: null,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stepStart,
          });

          if (resolvedUrl) currentUrl = resolvedUrl;
          continue;
        }

        case "extract":
        case "extract_data": {
          let extracted = claudeAction.extracted_data || null;
          let methodUsed = "vision_extract";
          if (!extracted || Object.keys(extracted).length === 0) {
            const extractResult = await actionExecutor.executeExtract(
              browserSession,
              currentUrl,
              claudeAction.fields || [],
              lastContent,
            );
            extracted = (extractResult.result as Record<string, unknown>) || {};
            methodUsed = extractResult.methodUsed;
          }

          metrics.record({
            domain,
            actionType: "extract",
            strategy: methodUsed,
            success: !!extracted,
            durationMs: Date.now() - stepStart,
            creditsCost: 0,
          });

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "extract_data",
            actionDetail: `Extrahiere: ${(claudeAction.fields || []).join(", ")} [${methodUsed}] — ${claudeAction.reasoning}`,
            htmlSummary: stepHtmlSummary,
            screenshot: proofScreenshot,
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
              htmlSummary: stepHtmlSummary,
              screenshot: proofScreenshot,
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
            htmlSummary: stepHtmlSummary,
            screenshot: proofScreenshot,
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
            htmlSummary: stepHtmlSummary,
            screenshot: proofScreenshot,
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
    await closeBrowserSession(browserSession.id);
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

  return {
    steps,
    summary: finalSummary || `${steps.length} Schritte ausgeführt`,
    extractedData: finalExtractedData,
    completionReason,
    sessionId: browserSession.id,
    browserBackend: browserSession.backend,
    warning: browserSession.warning,
    reasoningLog: reasoningLogger.toJSON(),
    verificationLog: [],
    reliabilityStats: {
      screenshotsSkipped: sessionStats.screenshotsSkipped,
      screenshotsTaken: sessionStats.screenshotsTaken,
      domVerifications: sessionStats.domVerifications,
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
  const enableProceduralMemory = config.enableProceduralMemory !== false; // Default: true
  const onProgress = typeof config.onProgress === "function"
    ? (config.onProgress as ComputerUseProgressCallback)
    : undefined;

  if (!task) {
    return { contextDelta: {}, success: false, error: "Aufgabe fehlt" };
  }
  if (!startUrl) {
    return { contextDelta: {}, success: false, error: "Start-URL fehlt" };
  }

  const preferMCPOverBrowser = config.preferMCPOverBrowser !== false; // Default: true
  const sessionStart = Date.now();
  const limitedModeWarning = !useBrowserMode
    ? "Running in limited mode (no browser). Results may be incomplete for JavaScript-heavy sites."
    : undefined;

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
      onProgress?.(`Opening browser session for ${startUrl}...`);
      const result = await executeWithRealBrowser(
        task, startUrl, maxSteps, captureScreenshots,
        enableCodeExecution, String(context._executionId || ""),
        enableProceduralMemory, agentId, onProgress,
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
        browserBackend: result.browserBackend,
        warning: result.warning,
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
          browserBackend: result.browserBackend,
          warning: result.warning,
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

    if (limitedModeWarning) {
      onProgress?.(limitedModeWarning);
    }

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
              warning: limitedModeWarning,
            },
          },
          success: false,
          error: loginResult.error || "Login fehlgeschlagen",
        };
      }
    }

    for (let i = 0; i < maxSteps; i++) {
      const stepStart = Date.now();
      onProgress?.(`Fetching ${currentUrl}...`);

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
      onProgress?.(describeComputerUseAction(claudeAction));

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
      warning: limitedModeWarning,
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
        warning: limitedModeWarning,
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
          warning: limitedModeWarning,
        },
      },
      success: false,
      error: err instanceof Error ? err.message : "Computer Use fehlgeschlagen",
      meta: { partialSession: true },
    };
  }
}
