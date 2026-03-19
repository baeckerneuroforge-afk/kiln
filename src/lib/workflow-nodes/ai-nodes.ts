/**
 * AI Tool Node Executors
 * Schnelle AI-Operationen mit Claude Haiku: Zusammenfassung, Klassifizierung, Extraktion.
 */

import {
  resolveExpression,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";

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

export async function executeAiNode(
  nodeType: string,
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  switch (nodeType) {
    case "ai_summarize":
      return executeAiSummarize(config, context);
    case "ai_classify":
      return executeAiClassify(config, context);
    case "ai_extract":
      return executeAiExtract(config, context);
    default:
      throw new Error(`Unbekannter AI-Node-Typ: ${nodeType}`);
  }
}
