/**
 * Deep Research Node Executor
 * Führt tiefe Web-Recherche mit Multi-Source-Verifikation durch.
 * Nutzt Perplexity API für Quellensuche und Claude für Konsolidierung.
 */

import {
  resolveExpression,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6";

export type ResearchDepth = "quick" | "standard" | "deep";

export interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  domain: string;
}

export interface ResearchResult {
  summary: string;
  fullReport: string;
  sources: ResearchSource[];
  confidence: number;
  depth: ResearchDepth;
  queriesUsed: string[];
  totalDurationMs: number;
  resultType?: "research";
  followUpQuestions?: string[];
}

const DEPTH_CONFIG: Record<ResearchDepth, { maxSources: number; queries: number; model: string }> = {
  quick: { maxSources: 5, queries: 2, model: HAIKU_MODEL },
  standard: { maxSources: 15, queries: 4, model: SONNET_MODEL },
  deep: { maxSources: 30, queries: 8, model: SONNET_MODEL },
};

/* ── Serper Search (Fallback wenn kein Perplexity) ── */

async function searchSerper(query: string, maxResults: number): Promise<ResearchSource[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("Weder PERPLEXITY_API_KEY noch SERPER_API_KEY konfiguriert");
  }

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: Math.min(maxResults, 10) }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Serper API: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as {
    organic?: Array<{ title: string; link: string; snippet: string }>;
  };

  return (data.organic || []).slice(0, maxResults).map((item, i) => ({
    url: item.link,
    title: item.title || extractDomainTitle(item.link),
    snippet: item.snippet || "",
    relevanceScore: Math.max(0.5, 1 - i * 0.08),
    domain: new URL(item.link).hostname,
  }));
}

/* ── Perplexity Search ── */

async function searchPerplexity(query: string, maxResults: number): Promise<ResearchSource[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    // Fallback zu Serper wenn Perplexity nicht verfügbar
    return searchSerper(query, maxResults);
  }

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: "You are a research assistant. Search for accurate, up-to-date information. Provide sources with URLs.",
        },
        {
          role: "user",
          content: `Research this topic and provide ${maxResults} high-quality sources with URLs:\n\n${query}`,
        },
      ],
      max_tokens: 2048,
      return_citations: true,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Perplexity API: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    citations?: string[];
  };

  const content = data.choices?.[0]?.message?.content || "";
  const citations = data.citations || [];

  // Quellen aus Citations extrahieren
  const sources: ResearchSource[] = citations.slice(0, maxResults).map((url, i) => ({
    url,
    title: extractDomainTitle(url),
    snippet: extractRelevantSnippet(content, url, i),
    relevanceScore: Math.max(0.5, 1 - i * 0.08),
    domain: new URL(url).hostname,
  }));

  // Falls keine Citations, aus dem Content URLs extrahieren
  if (sources.length === 0) {
    const urlMatches = content.match(/https?:\/\/[^\s)]+/g) || [];
    for (const url of urlMatches.slice(0, maxResults)) {
      try {
        sources.push({
          url,
          title: extractDomainTitle(url),
          snippet: content.slice(0, 200),
          relevanceScore: 0.6,
          domain: new URL(url).hostname,
        });
      } catch {
        // Ungültige URL
      }
    }
  }

  return sources;
}

function extractDomainTitle(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace("www.", "").split(".")[0];
  } catch {
    return url.slice(0, 50);
  }
}

function extractRelevantSnippet(content: string, url: string, index: number): string {
  // Versuche den Absatz rund um die URL-Referenz zu finden
  const refPatterns = [`[${index + 1}]`, `(${index + 1})`, url];
  for (const pattern of refPatterns) {
    const pos = content.indexOf(pattern);
    if (pos >= 0) {
      const start = Math.max(0, content.lastIndexOf("\n", pos - 1));
      const end = content.indexOf("\n", pos + pattern.length);
      return content.slice(start, end > start ? end : start + 300).trim().slice(0, 300);
    }
  }
  // Fallback: Anfang des Contents
  const chunkSize = Math.floor(content.length / Math.max(1, index + 1));
  return content.slice(index * chunkSize, (index + 1) * chunkSize).trim().slice(0, 300);
}

/* ── Query Generation ── */

async function generateSearchQueries(topic: string, count: number): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Generate ${count} diverse search queries to thoroughly research this topic. Each query should explore a different angle or aspect. Return ONLY a JSON array of strings.

Topic: ${topic}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`Claude API: ${response.status}`);

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const queries = JSON.parse(jsonMatch[0]) as string[];
      return queries.slice(0, count);
    }
  } catch {
    // Fallback
  }

  // Fallback: Einfache Variationen
  return [
    topic,
    `${topic} latest research`,
    `${topic} comparison analysis`,
    `${topic} best practices`,
  ].slice(0, count);
}

/* ── Konsolidierung ── */

async function consolidateResearch(
  topic: string,
  sources: ResearchSource[],
  model: string
): Promise<{
  summary: string;
  fullReport: string;
  confidence: number;
  resultType?: "research";
  followUpQuestions?: string[];
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht konfiguriert");

  const sourcesText = sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.url})\n${s.snippet}`)
    .join("\n\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `You are a research analyst. Analyze these sources about "${topic}" and create a comprehensive report.

Sources:
${sourcesText}

Respond in this exact JSON format:
{
  "summary": "2-3 sentence executive summary",
  "fullReport": "Detailed multi-paragraph report with source references [1], [2] etc. Include key findings, analysis, and conclusions.",
  "confidence": <0-100 confidence score based on source agreement and quality>,
  "resultType": "research",
  "followUpQuestions": ["Specific follow-up question 1", "Specific follow-up question 2", "Specific follow-up question 3"]
}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) throw new Error(`Claude API: ${response.status}`);

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        summary: string;
        fullReport: string;
        confidence: number;
        resultType?: "research";
        followUpQuestions?: string[];
      };
      return {
        summary: parsed.summary || "Keine Zusammenfassung verfügbar",
        fullReport: parsed.fullReport || text,
        confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
        resultType: "research",
        followUpQuestions: Array.isArray(parsed.followUpQuestions)
          ? parsed.followUpQuestions.map(String).filter(Boolean).slice(0, 4)
          : undefined,
      };
    }
  } catch {
    // Fallback
  }

  return {
    summary: text.slice(0, 300),
    fullReport: text,
    confidence: 50,
    resultType: "research",
  };
}

/* ── Main Executor ── */

export async function executeDeepResearch(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const topic = resolveExpression(String(config.topic || ""), context);
  const depth = (String(config.depth || "standard") as ResearchDepth);
  const resultKey = String(config.resultKey || "researchResult");
  const language = String(config.language || "en");
  const onProgress = typeof config.onProgress === "function"
    ? (config.onProgress as (message: string) => void)
    : undefined;

  if (!topic) {
    return { contextDelta: {}, success: false, error: "Forschungsthema fehlt" };
  }

  if (!process.env.PERPLEXITY_API_KEY && !process.env.SERPER_API_KEY) {
    return { contextDelta: {}, success: false, error: "Weder PERPLEXITY_API_KEY noch SERPER_API_KEY konfiguriert" };
  }

  const depthConfig = DEPTH_CONFIG[depth] || DEPTH_CONFIG.standard;
  const startTime = Date.now();

  try {
    // 1. Suchqueries generieren
    onProgress?.(`Planning research queries for "${topic}"...`);
    const queries = await generateSearchQueries(topic, depthConfig.queries);
    onProgress?.(`Generated ${queries.length} research quer${queries.length === 1 ? "y" : "ies"}.`);

    // 2. Parallel suchen
    const sourcesPerQuery = Math.ceil(depthConfig.maxSources / queries.length);
    const searchResults = await Promise.all(
      queries.map(async (q, index) => {
        onProgress?.(`Searching source set ${index + 1}/${queries.length}: ${q}`);
        const result = await searchPerplexity(q, sourcesPerQuery).catch(() => [] as ResearchSource[]);
        onProgress?.(`Found ${result.length} sources for query ${index + 1}.`);
        return result;
      })
    );

    // 3. Deduplizieren nach Domain+URL
    const seen = new Set<string>();
    const allSources: ResearchSource[] = [];
    for (const results of searchResults) {
      for (const source of results) {
        const key = source.url;
        if (!seen.has(key)) {
          seen.add(key);
          allSources.push(source);
        }
      }
    }

    // Nach Relevanz sortieren und begrenzen
    allSources.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topSources = allSources.slice(0, depthConfig.maxSources);
    onProgress?.(`Collected ${topSources.length} high-signal sources. Consolidating findings...`);

    if (topSources.length === 0) {
      return {
        contextDelta: {
          [resultKey]: {
            summary: "Keine relevanten Quellen gefunden",
            fullReport: "",
            sources: [],
            confidence: 0,
            depth,
            queriesUsed: queries,
            totalDurationMs: Date.now() - startTime,
          },
        },
        success: false,
        error: "Keine relevanten Quellen gefunden",
      };
    }

    // 4. Konsolidieren
    const consolidated = await consolidateResearch(
      language === "de" ? `${topic} (antworte auf Deutsch)` : topic,
      topSources,
      depthConfig.model
    );
    onProgress?.("Research synthesis completed.");

    const result: ResearchResult = {
      ...consolidated,
      sources: topSources,
      depth,
      queriesUsed: queries,
      totalDurationMs: Date.now() - startTime,
    };

    return {
      contextDelta: { [resultKey]: result },
      success: true,
      meta: {
        depth,
        sourcesFound: topSources.length,
        queriesUsed: queries.length,
        confidence: consolidated.confidence,
        totalDurationMs: result.totalDurationMs,
        model: depthConfig.model,
      },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Deep Research fehlgeschlagen",
      meta: { depth, topic, totalDurationMs: Date.now() - startTime },
    };
  }
}
