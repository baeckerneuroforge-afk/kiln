/**
 * Computer Use Node Executor — V1.0
 * Multi-Page Navigation mit echten Screenshots, Link-Resolution,
 * und strukturiertem Session-Replay-Format.
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

const COMPUTER_USE_MODEL = "claude-sonnet-4-20250514";
const MAX_LOOP_STEPS = 25;

/* ── Types ── */

export interface ComputerUseSessionStep {
  stepIndex: number;
  url: string;
  action: "navigate" | "click_link" | "extract_data" | "done" | "analyze";
  actionDetail: string;
  htmlSummary: string;
  screenshot: string | null; // base64 PNG
  extractedData: Record<string, unknown> | null;
  timestamp: string; // ISO
  durationMs: number;
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
}

/* ── Claude Action Response ── */

interface ClaudeAction {
  action: "navigate" | "click_link" | "extract_data" | "done";
  url?: string;
  selector?: string;
  fields?: string[];
  summary?: string;
  extracted_data?: Record<string, unknown>;
  reasoning: string;
}

/* ── HTML Parsing Helpers ── */

/**
 * Extrahiert einen kurzen Zusammenfassungstext aus HTML.
 */
function extractHtmlSummary(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 100) : "";

  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
  const meta = metaMatch ? metaMatch[1].trim().slice(0, 200) : "";

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim().slice(0, 100) : "";

  return [title, h1, meta].filter(Boolean).join(" | ").slice(0, 300);
}

/**
 * Findet Links im HTML die zum Selektor-Text passen.
 */
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

/**
 * Extrahiert Daten aus HTML basierend auf Feldnamen.
 */
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

/* ── Session / Cookie Support ── */

interface BrowsingSession {
  cookies: Record<string, string>;
}

function createSession(): BrowsingSession {
  return { cookies: {} };
}

function serializeCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

function captureSetCookies(response: Response, session: BrowsingSession): void {
  const setCookies = response.headers.getSetCookie?.() || [];
  for (const cookie of setCookies) {
    const match = cookie.match(/^([^=]+)=([^;]*)/);
    if (match) session.cookies[match[1].trim()] = match[2].trim();
  }
}

/* ── Page Fetching ── */

async function fetchPage(
  url: string,
  session?: BrowsingSession
): Promise<{ html: string; finalUrl: string }> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
  };

  if (session && Object.keys(session.cookies).length > 0) {
    headers["Cookie"] = serializeCookies(session.cookies);
  }

  const response = await safeFetch(url, { headers });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  if (session) captureSetCookies(response, session);

  const html = await response.text();
  return { html: html.slice(0, 50000), finalUrl: response.url || url };
}

/* ── Claude Decision Engine ── */

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
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");
  }

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
    usage: { input_tokens: number; output_tokens: number };
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
  session: BrowsingSession,
  steps: ComputerUseSessionStep[]
): Promise<LoginResult> {
  const cred = await getDecryptedCredential(credentialId, agentId);
  if (!cred) return { success: false, error: "Credential nicht gefunden" };

  // Login-Seite laden
  const loginPage = await fetchPage(cred.loginUrl, session);

  // Felder identifizieren via Claude
  const fields = await identifyLoginFields(loginPage.html);
  if (!fields) {
    return { success: false, error: "Login-Formular konnte nicht analysiert werden" };
  }

  // Login-Versuch (max 2 Versuche)
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
        "Cookie": serializeCookies(session.cookies),
      },
      body: formData.toString(),
      redirect: "follow",
    });

    captureSetCookies(response, session);
    const responseHtml = await response.text();
    const responseUrl = response.url || actionUrl;

    // Login-Step protokollieren
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

    // Erfolg prüfen: kein Login-Formular mehr sichtbar + keine Error-Meldungen
    const lowerHtml = responseHtml.toLowerCase();
    const hasLoginForm = lowerHtml.includes('type="password"');
    const hasError = lowerHtml.includes("invalid") || lowerHtml.includes("incorrect") || lowerHtml.includes("failed");
    const redirectedAway = responseUrl !== cred.loginUrl;

    if (!hasLoginForm && (redirectedAway || !hasError)) {
      await markCredentialUsed(credentialId);
      return { success: true };
    }

    // Bei Fehler: Seite neu laden für frisches CSRF-Token
    if (attempt === 0) {
      const freshPage = await fetchPage(cred.loginUrl, session);
      const freshFields = await identifyLoginFields(freshPage.html);
      if (freshFields?.csrfToken) {
        fields.csrfToken = freshFields.csrfToken;
      }
    }
  }

  return { success: false, error: `Login bei ${cred.serviceName} fehlgeschlagen nach 2 Versuchen` };
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

  if (!task) {
    return { contextDelta: {}, success: false, error: "Aufgabe fehlt" };
  }
  if (!startUrl) {
    return { contextDelta: {}, success: false, error: "Start-URL fehlt" };
  }

  const sessionStart = Date.now();
  const steps: ComputerUseSessionStep[] = [];
  let currentUrl = startUrl;
  let screenshotsAvailable = false;
  let finalSummary = "";
  let finalExtractedData: Record<string, unknown> | null = null;
  let completionReason: ComputerUseSession["completionReason"] = "max_steps";
  const browsingSession = createSession();

  try {
    // Login-Flow wenn aktiviert
    if (requiresLogin && credentialId && agentId) {
      const loginResult = await performLogin(credentialId, agentId, browsingSession, steps);
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
            },
          },
          success: false,
          error: loginResult.error || "Login fehlgeschlagen",
        };
      }
    }

    for (let i = 0; i < maxSteps; i++) {
      const stepStart = Date.now();

      // 1. Seite abrufen
      const page = await fetchPage(currentUrl, browsingSession);
      currentUrl = page.finalUrl;
      const htmlSummary = extractHtmlSummary(page.html);

      // 2. Screenshot nehmen (wenn konfiguriert)
      let screenshot: string | null = null;
      if (captureScreenshots) {
        screenshot = await takeScreenshot(currentUrl);
        if (screenshot) screenshotsAvailable = true;
      }

      // 3. Claude fragen was als nächstes zu tun ist
      const claudeAction = await askClaudeForAction(
        task,
        currentUrl,
        page.html,
        htmlSummary,
        steps,
        extractData,
        dataSchema,
        !!screenshot,
      );

      // 4. Aktion ausführen
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
          });

          if (claudeAction.url) {
            try {
              currentUrl = new URL(claudeAction.url, currentUrl).href;
            } catch {
              currentUrl = claudeAction.url;
            }
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

          if (resolvedUrl) {
            currentUrl = resolvedUrl;
          }
          continue;
        }

        case "extract_data": {
          const extracted = claudeAction.fields
            ? extractDataFromHtml(page.html, claudeAction.fields)
            : {};

          steps.push({
            stepIndex: i,
            url: currentUrl,
            action: "extract_data",
            actionDetail: `Extrahiere: ${(claudeAction.fields || []).join(", ")} — ${claudeAction.reasoning}`,
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

      if (completionReason === "done" || completionReason === "no_next_url") {
        break;
      }
    }

    const cuSession: ComputerUseSession = {
      task,
      startUrl,
      steps,
      summary: finalSummary || `${steps.length} Schritte ausgeführt`,
      extractedData: finalExtractedData,
      totalDurationMs: Date.now() - sessionStart,
      urlsVisited: Array.from(new Set(steps.map((s) => s.url))),
      screenshotsAvailable,
      completionReason,
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
      },
    };
  } catch (err) {
    const partialSession: ComputerUseSession = {
      task,
      startUrl,
      steps,
      summary: err instanceof Error ? err.message : "Fehler aufgetreten",
      extractedData: finalExtractedData,
      totalDurationMs: Date.now() - sessionStart,
      urlsVisited: Array.from(new Set(steps.map((s) => s.url))),
      screenshotsAvailable,
      completionReason: "error",
    };

    return {
      contextDelta: { [resultKey]: partialSession },
      success: false,
      error: err instanceof Error ? err.message : "Computer Use fehlgeschlagen",
      meta: { stepsCompleted: steps.length, partialSession: true },
    };
  }
}
