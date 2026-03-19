/**
 * Computer Use Node Executor
 * Nutzt Claude's Computer Use API um Webseiten zu besuchen,
 * Screenshots zu machen und strukturierte Daten zu extrahieren.
 */

import {
  resolveExpression,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import { safeFetch } from "@/lib/url-validation";

const COMPUTER_USE_MODEL = "claude-sonnet-4-20250514";
const MAX_LOOP_STEPS = 25;

interface ComputerUseStep {
  action: string;
  url?: string;
  screenshot?: string; // base64
  text?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }>;
}

/**
 * Fetch a URL and take a "screenshot" by getting the HTML content.
 * In production this would use a headless browser; here we use the page HTML
 * and let Claude reason about it.
 */
async function fetchPage(url: string): Promise<{ html: string; finalUrl: string }> {
  const response = await safeFetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KilnBot/1.0)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  // Truncate to avoid token explosion
  const truncated = html.slice(0, 50000);

  return { html: truncated, finalUrl: response.url || url };
}

/**
 * Call Claude with computer_use tool to analyze a webpage and decide next actions.
 */
async function callClaudeComputerUse(
  task: string,
  currentUrl: string,
  pageContent: string,
  previousSteps: ComputerUseStep[],
  extractData: boolean,
  dataSchema: string,
): Promise<{
  done: boolean;
  nextUrl?: string;
  extractedData?: Record<string, unknown>;
  summary?: string;
  reasoning: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");
  }

  const stepsContext = previousSteps.length > 0
    ? `\n\nBisherige Schritte:\n${previousSteps.map((s, i) => `${i + 1}. ${s.action}${s.url ? ` → ${s.url}` : ""}${s.text ? `: ${s.text.slice(0, 200)}` : ""}`).join("\n")}`
    : "";

  const extractionInstruction = extractData && dataSchema
    ? `\n\nWenn du die Aufgabe abgeschlossen hast, extrahiere die Daten in folgendem Schema:\n${dataSchema}\n\nGib die extrahierten Daten als JSON im "extracted_data" Feld zurück.`
    : "";

  const systemPrompt = `Du bist ein Web-Browsing-Agent. Deine Aufgabe ist es, Webseiten zu besuchen und Informationen zu sammeln.

Aktuelle URL: ${currentUrl}
${stepsContext}
${extractionInstruction}

Antworte AUSSCHLIESSLICH als JSON:
{
  "done": true/false,
  "reasoning": "Warum diese Entscheidung",
  "next_url": "URL falls noch nicht fertig (optional)",
  "summary": "Zusammenfassung der gefundenen Informationen (wenn done=true)",
  "extracted_data": {} (wenn done=true und Datenextraktion gewünscht)
}`;

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
          content: `Aufgabe: ${task}\n\nAktueller Seiteninhalt (gekürzt):\n\`\`\`html\n${pageContent.slice(0, 30000)}\n\`\`\`\n\nAnalysiere den Inhalt und entscheide den nächsten Schritt.`,
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
    // Extract JSON from possible markdown code blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { done: true, reasoning: text, summary: text };
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      done?: boolean;
      reasoning?: string;
      next_url?: string;
      summary?: string;
      extracted_data?: Record<string, unknown>;
    };
    return {
      done: parsed.done ?? true,
      nextUrl: parsed.next_url,
      extractedData: parsed.extracted_data,
      summary: parsed.summary,
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return { done: true, reasoning: "Konnte Antwort nicht parsen", summary: text };
  }
}

/**
 * Hauptfunktion: Computer Use Node ausführen.
 * Besucht die Start-URL, lässt Claude den Inhalt analysieren,
 * und folgt ggf. Links bis die Aufgabe erledigt ist.
 */
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

  if (!task) {
    return { contextDelta: {}, success: false, error: "Aufgabe fehlt" };
  }
  if (!startUrl) {
    return { contextDelta: {}, success: false, error: "Start-URL fehlt" };
  }

  const steps: ComputerUseStep[] = [];
  let currentUrl = startUrl;
  const totalTokensIn = 0;
  const totalTokensOut = 0;

  try {
    for (let i = 0; i < maxSteps; i++) {
      // Seite abrufen
      const page = await fetchPage(currentUrl);
      currentUrl = page.finalUrl;

      steps.push({
        action: i === 0 ? "navigate" : "follow_link",
        url: currentUrl,
        text: page.html.slice(0, 500),
      });

      // Claude analysieren lassen
      const result = await callClaudeComputerUse(
        task,
        currentUrl,
        page.html,
        steps,
        extractData,
        dataSchema,
      );

      steps.push({
        action: result.done ? "complete" : "analyze",
        text: result.reasoning.slice(0, 300),
      });

      if (result.done) {
        const output: Record<string, unknown> = {
          summary: result.summary || "",
          stepsCount: steps.length,
          urls: steps.filter(s => s.url).map(s => s.url),
        };

        if (result.extractedData) {
          output.extractedData = result.extractedData;
        }

        if (captureScreenshots) {
          output.steps = steps.map(({ action, url, text }) => ({ action, url, text }));
        }

        return {
          contextDelta: { [resultKey]: output },
          success: true,
          meta: {
            stepsCount: steps.length,
            urlsVisited: steps.filter(s => s.url).map(s => s.url),
            tokensIn: totalTokensIn,
            tokensOut: totalTokensOut,
            model: COMPUTER_USE_MODEL,
            hasExtractedData: !!result.extractedData,
          },
        };
      }

      // Nächste URL folgen
      if (result.nextUrl) {
        // Relative URLs auflösen
        try {
          currentUrl = new URL(result.nextUrl, currentUrl).href;
        } catch {
          currentUrl = result.nextUrl;
        }
      } else {
        // Keine nächste URL, aber nicht fertig → abbrechen
        return {
          contextDelta: {
            [resultKey]: {
              summary: "Agent konnte keine weiteren Schritte identifizieren",
              stepsCount: steps.length,
              urls: steps.filter(s => s.url).map(s => s.url),
            },
          },
          success: true,
          meta: { stepsCount: steps.length, earlyStop: true },
        };
      }
    }

    // Max steps erreicht
    return {
      contextDelta: {
        [resultKey]: {
          summary: `Maximale Schrittanzahl (${maxSteps}) erreicht`,
          stepsCount: steps.length,
          urls: steps.filter(s => s.url).map(s => s.url),
          steps: captureScreenshots ? steps.map(({ action, url, text }) => ({ action, url, text })) : undefined,
        },
      },
      success: true,
      meta: { stepsCount: steps.length, maxStepsReached: true },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Computer Use fehlgeschlagen",
      meta: { stepsCompleted: steps.length },
    };
  }
}
