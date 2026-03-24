/**
 * Research Synthesizer — Builds source-backed reports from collected pages.
 * Uses Claude to create citation-backed analysis with [1][2][3] references.
 */

import type { PageResult } from "@/lib/browser/http-extractor";

/* ── Types ── */

export interface SynthesisSource {
  index: number;
  title: string;
  url: string;
  domain: string;
  confidence: number;
}

export interface SynthesisResult {
  summary: string;
  fullReport: string;
  confidence: number;
  resultType: "instant_extract" | "search" | "deep";
  sources: SynthesisSource[];
  followUpQuestions: string[];
  model: string;
  depth: "concise" | "comprehensive";
  totalDurationMs?: number;
}

/* ── Constants ── */

/* Models are passed as parameters to synthesizeWithClaude */

/* ── Main Synthesizer ── */

/**
 * Synthesizes a research report from fetched pages using Claude.
 */
export async function synthesizeWithClaude(
  model: string,
  query: string,
  pages: PageResult[],
  depth: "concise" | "comprehensive",
): Promise<SynthesisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const sourcesContext = pages
    .map(
      (p, i) =>
        `[${i + 1}] ${p.title} (${p.url})\n${p.snippet || p.extractedText?.slice(0, 500) || ""}`,
    )
    .join("\n\n");

  const prompt =
    depth === "concise"
      ? `Based on these sources, answer concisely: "${query}"

Sources:
${sourcesContext}

Rules:
- Cite every fact with [N] where N is the source number
- Be concise: 2-3 paragraphs max
- Start with a direct answer, then supporting details
- End with a brief sources list

Respond as JSON:
{
  "summary": "1-2 sentence TL;DR",
  "fullReport": "Your concise report with [N] citations",
  "confidence": <0-100>,
  "followUpQuestions": ["question 1", "question 2", "question 3"]
}`
      : `Based on these sources, provide a comprehensive analysis: "${query}"

Sources:
${sourcesContext}

Rules:
- Cite every fact with [N] where N is the source number
- Structure with clear sections using markdown headers
- Include an executive summary at the top
- Note any contradictions between sources
- If data supports it, include a comparison table (markdown)
- End with a confidence assessment and follow-up questions

Respond as JSON:
{
  "summary": "2-3 sentence executive summary",
  "fullReport": "Detailed multi-section report with [N] citations, markdown formatting, and tables where appropriate",
  "confidence": <0-100>,
  "followUpQuestions": ["specific question 1", "specific question 2", "specific question 3", "specific question 4"]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: depth === "concise" ? 2048 : 4096,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) throw new Error(`Claude API: ${response.status}`);

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseJsonResponse(text);

  const sources: SynthesisSource[] = pages.map((p, i) => ({
    index: i + 1,
    title: p.title,
    url: p.url,
    domain: extractDomain(p.url),
    confidence: p.confidence,
  }));

  return {
    summary: parsed.summary || text.slice(0, 300),
    fullReport: parsed.fullReport || text,
    confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
    resultType: depth === "concise" ? "search" : "deep",
    sources,
    followUpQuestions: parsed.followUpQuestions || [],
    model,
    depth,
  };
}

/**
 * Builds an instant extract result (Layer 1) — no LLM needed.
 */
export function buildInstantExtractResult(
  page: PageResult,
  query: string,
): SynthesisResult {
  const dataEntries = Object.entries(page.data)
    .filter(([k, v]) => !k.startsWith("_") && v !== undefined && v !== null)
    .map(([k, v]) => `**${k}**: ${String(v)}`);

  const fullReport = dataEntries.length > 0
    ? `## Extracted Data\n\n${dataEntries.join("\n")}\n\n**Source**: [1] ${page.title} (${page.url})\n**Confidence**: ${Math.round(page.confidence * 100)}%\n**Method**: ${page.method} (${page.durationMs}ms, 0 credits)`
    : `No structured data found at ${page.url}.`;

  return {
    summary: dataEntries.length > 0
      ? `Found ${dataEntries.length} data fields from ${extractDomain(page.url)}.`
      : `Could not extract structured data from ${page.url}.`,
    fullReport,
    confidence: Math.round(page.confidence * 100),
    resultType: "instant_extract",
    sources: [{
      index: 1,
      title: page.title,
      url: page.url,
      domain: extractDomain(page.url),
      confidence: page.confidence,
    }],
    followUpQuestions: generateExtractFollowUps(page, query),
    model: "none",
    depth: "concise",
  };
}

/* ── Helpers ── */

function parseJsonResponse(text: string): {
  summary?: string;
  fullReport?: string;
  confidence?: number;
  followUpQuestions?: string[];
} {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
        fullReport: typeof parsed.fullReport === "string" ? parsed.fullReport : undefined,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
        followUpQuestions: Array.isArray(parsed.followUpQuestions)
          ? parsed.followUpQuestions.map(String).filter(Boolean).slice(0, 4)
          : undefined,
      };
    }
  } catch {
    // Parse failed
  }
  return {};
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url.slice(0, 50);
  }
}

function generateExtractFollowUps(page: PageResult, query: string): string[] {
  const domain = extractDomain(page.url);
  const followUps: string[] = [];

  if (page.data.price) {
    followUps.push(`Compare this price with other retailers`);
  }
  if (page.data.title) {
    followUps.push(`Find reviews for ${String(page.data.title).slice(0, 50)}`);
  }
  followUps.push(`Deep dive: ${query}`);
  followUps.push(`Find similar products on ${domain}`);

  return followUps.slice(0, 3);
}
