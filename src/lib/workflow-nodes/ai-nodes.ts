/**
 * AI Tool Node Executors
 * Schnelle AI-Operationen mit Claude Haiku: Zusammenfassung, Klassifizierung, Extraktion.
 */

import {
  resolveExpression,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import { executeComputerUse } from "./computer-use-node";
import { executeDeepResearch } from "./deep-research-node";
import { executeCodeSandbox } from "./code-sandbox-node";
import { executeDiffDetection } from "./diff-detection-node";
import { executeMultiSite } from "./multi-site-node";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

async function callHaiku(systemPrompt: string, userPrompt: string): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
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

  return {
    text,
    tokensIn: data.usage.input_tokens,
    tokensOut: data.usage.output_tokens,
  };
}

/* ── AI Summarize ── */

export async function executeAiSummarize(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const input = resolveExpression(String(config.input || ""), context);
  const maxLength = String(config.maxLength || "kurz");
  const language = String(config.language || "de");
  const resultKey = String(config.resultKey || "summary");

  if (!input) {
    return { contextDelta: {}, success: false, error: "Eingabetext fehlt" };
  }

  const lengthInstruction =
    maxLength === "kurz" ? "Maximal 2-3 Sätze." :
    maxLength === "mittel" ? "Maximal 1 Absatz (4-6 Sätze)." :
    "Ausführliche Zusammenfassung, maximal 3 Absätze.";

  const systemPrompt = `Du bist ein Zusammenfassungs-Experte. Fasse den gegebenen Text präzise zusammen. ${lengthInstruction} Antworte in ${language === "de" ? "Deutsch" : language === "en" ? "Englisch" : language}.`;

  try {
    const result = await callHaiku(systemPrompt, input);

    return {
      contextDelta: {
        [resultKey]: result.text,
      },
      success: true,
      meta: {
        inputLength: input.length,
        outputLength: result.text.length,
        maxLength,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        model: HAIKU_MODEL,
      },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "AI Zusammenfassung fehlgeschlagen",
    };
  }
}

/* ── AI Classify ── */

export async function executeAiClassify(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const input = resolveExpression(String(config.input || ""), context);
  const categoriesRaw = resolveExpression(String(config.categories || ""), context);
  const resultKey = String(config.resultKey || "classification");

  if (!input || !categoriesRaw) {
    return { contextDelta: {}, success: false, error: "Eingabetext und Kategorien sind erforderlich" };
  }

  const systemPrompt = `Du bist ein Klassifizierungs-Experte. Ordne den gegebenen Text einer der folgenden Kategorien zu: ${categoriesRaw}

Antworte AUSSCHLIESSLICH im folgenden JSON-Format:
{"category": "<gewählte Kategorie>", "confidence": <0.0-1.0>, "reasoning": "<kurze Begründung>"}`;

  try {
    const result = await callHaiku(systemPrompt, input);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      parsed = { category: result.text.trim(), confidence: null, reasoning: null };
    }

    return {
      contextDelta: {
        [resultKey]: parsed,
      },
      success: true,
      meta: {
        category: parsed.category,
        confidence: parsed.confidence,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        model: HAIKU_MODEL,
      },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "AI Klassifizierung fehlgeschlagen",
    };
  }
}

/* ── AI Extract ── */

export async function executeAiExtract(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const input = resolveExpression(String(config.input || ""), context);
  const fieldsRaw = resolveExpression(String(config.fields || ""), context);
  const resultKey = String(config.resultKey || "extracted");

  if (!input || !fieldsRaw) {
    return { contextDelta: {}, success: false, error: "Eingabetext und zu extrahierende Felder sind erforderlich" };
  }

  const systemPrompt = `Du bist ein Datenextraktions-Experte. Extrahiere die folgenden Felder aus dem gegebenen Text: ${fieldsRaw}

Antworte AUSSCHLIESSLICH als JSON-Objekt mit den genannten Feldern als Keys. Wenn ein Feld nicht gefunden wird, setze den Wert auf null.`;

  try {
    const result = await callHaiku(systemPrompt, input);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      parsed = { raw: result.text.trim() };
    }

    return {
      contextDelta: {
        [resultKey]: parsed,
      },
      success: true,
      meta: {
        fieldsExtracted: Object.keys(parsed).filter((k) => parsed[k] !== null),
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        model: HAIKU_MODEL,
      },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "AI Extraktion fehlgeschlagen",
    };
  }
}

/* ── Dispatcher ── */

// Knowledge-Extraction-Typen die automatisch populiert werden
const KNOWLEDGE_EXTRACTABLE_TYPES = new Set([
  "computer_use",
  "deep_research",
  "diff_detection",
  "multi_site",
]);

/** Callback für Live-Events aus AI-Nodes (Browser-Events, Progress etc.) */
export type NodeEventCallback = (event: {
  eventType: string;
  [key: string]: unknown;
}) => void;

export async function executeAiNode(
  nodeType: string,
  config: Record<string, unknown>,
  context: ExpressionContext,
  onNodeEvent?: NodeEventCallback,
): Promise<ActionNodeResult> {
  let result: ActionNodeResult;

  switch (nodeType) {
    case "ai_summarize":
      result = await executeAiSummarize(config, context);
      break;
    case "ai_classify":
      result = await executeAiClassify(config, context);
      break;
    case "ai_extract":
      result = await executeAiExtract(config, context);
      break;
    case "computer_use": {
      // Browser-Events und Progress an Workflow-Runtime durchreichen
      const cuConfig = { ...config };
      if (onNodeEvent) {
        cuConfig.onBrowserEvent = (event: Record<string, unknown>) => {
          onNodeEvent({ eventType: "browser", ...event });
        };
        cuConfig.onProgress = (message: string) => {
          onNodeEvent({ eventType: "progress", message });
        };
      }
      result = await executeComputerUse(cuConfig, context);
      break;
    }
    case "deep_research": {
      // Progress-Events an Workflow-Runtime durchreichen
      const drConfig = { ...config };
      if (onNodeEvent) {
        drConfig.onProgress = (message: string) => {
          onNodeEvent({ eventType: "progress", message });
        };
      }
      result = await executeDeepResearch(drConfig, context);
      break;
    }
    case "code_sandbox":
      result = await executeCodeSandbox(config, context);
      break;
    case "diff_detection":
      result = await executeDiffDetection(config, context);
      break;
    case "multi_site":
      result = await executeMultiSite(config, context);
      break;
    default:
      throw new Error(`Unbekannter AI-Node-Typ: ${nodeType}`);
  }

  // Knowledge Graph Auto-Population: Extrahiere Entitäten aus erfolgreichen Ergebnissen
  if (result.success && KNOWLEDGE_EXTRACTABLE_TYPES.has(nodeType)) {
    const userId = String(context._userId || "");
    const agentId = String(context._agentId || "");
    const executionId = String(context._executionId || "");

    if (userId && agentId) {
      // Asynchron im Hintergrund — blockiert den Workflow NICHT
      import("@/lib/knowledge/knowledge-extractor").then(({ knowledgeExtractor }) => {
        const resultType = nodeType as "computer_use" | "diff_detection" | "deep_research" | "multi_site";

        if (nodeType === "computer_use") {
          const cuData = result.contextDelta?.[Object.keys(result.contextDelta)[0]];
          knowledgeExtractor.extractFromComputerUse(userId, agentId, executionId, {
            summary: (cuData as Record<string, unknown>)?.summary as string,
            extractedData: (cuData as Record<string, unknown>)?.extractedData,
            urls: (cuData as Record<string, unknown>)?.urlsVisited as string[],
          }).catch(() => {});
        } else if (nodeType === "diff_detection") {
          knowledgeExtractor.extract(userId, agentId, executionId, result.contextDelta, resultType).catch(() => {});
        } else if (nodeType === "deep_research") {
          knowledgeExtractor.extract(userId, agentId, executionId, result.contextDelta, resultType).catch(() => {});
        } else if (nodeType === "multi_site") {
          knowledgeExtractor.extract(userId, agentId, executionId, result.contextDelta, resultType).catch(() => {});
        }
      }).catch(() => {
        // Knowledge-Extraktion darf den Hauptfluss NICHT blockieren
      });
    }
  }

  return result;
}
