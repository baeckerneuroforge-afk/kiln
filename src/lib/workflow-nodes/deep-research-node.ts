/**
 * Deep Research Node Executor — 3-Layer Research Engine
 *
 * Layer 1 — Instant Extract (< 2s, 0 credits):
 *   URL provided → HTTP fetch → SmartExtractor → structured data
 *
 * Layer 2 — Web Search + Page Reading (10-20s, 2-5 credits):
 *   Search → fetch top results → extract data → Haiku synthesis with citations
 *
 * Layer 3 — Deep Dive (30-60s, 10-20 credits):
 *   Search → fetch → follow links → cross-reference → Sonnet synthesis
 */

import {
  resolveExpression,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import {
  fetchMultiplePages,
  extractLinksFromPages,
  type PageResult,
} from "@/lib/browser/http-extractor";
import {
  synthesizeWithClaude,
  buildInstantExtractResult,
} from "@/lib/research/synthesizer";

/* ── Constants ── */

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6";

/* ── Types ── */

export type ResearchDepth = "quick" | "standard" | "deep";
export type ResearchLayer = "extract" | "search" | "deep";

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
  layer: ResearchLayer;
  queriesUsed: string[];
  totalDurationMs: number;
  resultType?: "research" | "instant_extract";
  followUpQuestions?: string[];
}

const DEPTH_CONFIG: Record<ResearchDepth, { maxSources: number; queries: number; model: string }> = {
  quick: { maxSources: 5, queries: 2, model: HAIKU_MODEL },
  standard: { maxSources: 15, queries: 4, model: SONNET_MODEL },
  deep: { maxSources: 30, queries: 8, model: SONNET_MODEL },
};

/* ── Layer Detection ── */

/**
 * Detects which research layer to use based on the message.
 */
export function detectResearchLayer(message: string): ResearchLayer {
  const hasUrl = /https?:\/\/\S+/.test(message);
  const wordCount = message.split(/\s+/).length;
  const isDeepRequest = /\b(research|analyse|analyze|compare|comprehensive|detailed|report|deep|thorough|market|overview|all\s+options)\b/i.test(message);

  // Layer 1: URL + simple question → instant extract
  if (hasUrl && wordCount < 15 && !isDeepRequest) return "extract";

  // Layer 3: Complex/research-type queries
  if (isDeepRequest) return "deep";

  // Layer 2: Everything else → web search
  return "search";
}

/**
 * Maps layer to ResearchDepth for backward compatibility.
 */
function layerToDepth(layer: ResearchLayer): ResearchDepth {
  switch (layer) {
    case "extract": return "quick";
    case "search": return "standard";
    case "deep": return "deep";
  }
}

/* ── Search Providers ── */

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

  if (!res.ok) throw new Error(`Serper API: ${res.status} ${res.statusText}`);

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

async function searchPerplexity(query: string, maxResults: number): Promise<ResearchSource[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return searchSerper(query, maxResults);

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
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

  if (!response.ok) throw new Error(`Perplexity API: ${response.status} ${response.statusText}`);

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    citations?: string[];
  };

  const content = data.choices?.[0]?.message?.content || "";
  const citations = data.citations || [];

  const sources: ResearchSource[] = citations.slice(0, maxResults).map((url, i) => ({
    url,
    title: extractDomainTitle(url),
    snippet: extractRelevantSnippet(content, url, i),
    relevanceScore: Math.max(0.5, 1 - i * 0.08),
    domain: new URL(url).hostname,
  }));

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
      } catch { /* Ungültige URL */ }
    }
  }

  return sources;
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
          content: `Generate ${count} diverse search queries to thoroughly research this topic. Each query should explore a different angle or aspect. Return ONLY a JSON array of strings.\n\nTopic: ${topic}`,
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
  } catch { /* Fallback */ }

  return [topic, `${topic} latest research`, `${topic} comparison analysis`, `${topic} best practices`].slice(0, count);
}

/* ── Helpers ── */

function extractDomainTitle(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "").split(".")[0];
  } catch {
    return url.slice(0, 50);
  }
}

function extractRelevantSnippet(content: string, url: string, index: number): string {
  const refPatterns = [`[${index + 1}]`, `(${index + 1})`, url];
  for (const pattern of refPatterns) {
    const pos = content.indexOf(pattern);
    if (pos >= 0) {
      const start = Math.max(0, content.lastIndexOf("\n", pos - 1));
      const end = content.indexOf("\n", pos + pattern.length);
      return content.slice(start, end > start ? end : start + 300).trim().slice(0, 300);
    }
  }
  const chunkSize = Math.floor(content.length / Math.max(1, index + 1));
  return content.slice(index * chunkSize, (index + 1) * chunkSize).trim().slice(0, 300);
}

function extractUrlsFromMessage(message: string): string[] {
  const matches = message.match(/https?:\/\/[^\s"'<>)]+/g) || [];
  return [...new Set(matches)];
}

function pagesToSources(pages: PageResult[]): ResearchSource[] {
  return pages.map((p) => ({
    url: p.url,
    title: p.title,
    snippet: p.snippet,
    relevanceScore: Math.max(0.5, p.confidence),
    domain: extractDomainTitle(p.url),
  }));
}

/* ── Main Executor ── */

export async function executeDeepResearch(
  config: Record<string, unknown>,
  context: ExpressionContext,
): Promise<ActionNodeResult> {
  const topic = resolveExpression(String(config.topic || ""), context);
  const depthOverride = config.depth ? String(config.depth) as ResearchDepth : undefined;
  const layerOverride = config.layer && config.layer !== "auto"
    ? String(config.layer) as ResearchLayer
    : undefined;
  const resultKey = String(config.resultKey || "researchResult");
  const language = String(config.language || "en");
  const onProgress = typeof config.onProgress === "function"
    ? (config.onProgress as (message: string) => void)
    : undefined;

  if (!topic) {
    return { contextDelta: {}, success: false, error: "Forschungsthema fehlt" };
  }

  const startTime = Date.now();
  const layer = layerOverride || detectResearchLayer(topic);
  const depth = depthOverride || layerToDepth(layer);
  const depthConfig = DEPTH_CONFIG[depth] || DEPTH_CONFIG.standard;

  try {
    // ═══ LAYER 1: Instant Extract ═══
    if (layer === "extract") {
      const urls = extractUrlsFromMessage(topic);

      if (urls.length > 0) {
        onProgress?.("⚡ Instant extract — fetching page directly...");

        const pages = await fetchMultiplePages(urls, 3);
        const bestPage = pages.sort((a, b) => b.fieldsFound.length - a.fieldsFound.length)[0];

        if (bestPage && bestPage.fieldsFound.length >= 2) {
          const synthesis = buildInstantExtractResult(bestPage, topic);
          onProgress?.(`Extracted ${bestPage.fieldsFound.length} fields in ${bestPage.durationMs}ms.`);

          const result: ResearchResult = {
            summary: synthesis.summary,
            fullReport: synthesis.fullReport,
            sources: pagesToSources(pages.filter(Boolean)),
            confidence: synthesis.confidence,
            depth: "quick",
            layer: "extract",
            queriesUsed: [],
            totalDurationMs: Date.now() - startTime,
            resultType: "instant_extract",
            followUpQuestions: synthesis.followUpQuestions,
          };

          return {
            contextDelta: { [resultKey]: result },
            success: true,
            meta: {
              layer: "extract",
              depth: "quick",
              sourcesFound: pages.length,
              fieldsExtracted: bestPage.fieldsFound.length,
              totalDurationMs: result.totalDurationMs,
              model: "none",
              creditsUsed: 0,
            },
          };
        }

        // Extraction insufficient — fall through to Layer 2
        onProgress?.("Extraction incomplete — expanding to web search...");
      }
    }

    // ═══ LAYER 2: Web Search + Page Reading ═══
    if (layer === "search" || layer === "extract") {
      if (!process.env.PERPLEXITY_API_KEY && !process.env.SERPER_API_KEY) {
        return { contextDelta: {}, success: false, error: "Weder PERPLEXITY_API_KEY noch SERPER_API_KEY konfiguriert" };
      }

      // 2a. Generate queries
      onProgress?.("🔍 Searching the web...");
      const queries = await generateSearchQueries(topic, depthConfig.queries);
      onProgress?.(`Generated ${queries.length} search queries.`);

      // 2b. Search in parallel
      const sourcesPerQuery = Math.ceil(depthConfig.maxSources / queries.length);
      const searchResults = await Promise.all(
        queries.map(async (q) => {
          onProgress?.(`Searching: ${q}`);
          return searchPerplexity(q, sourcesPerQuery).catch(() => [] as ResearchSource[]);
        }),
      );

      // 2c. Deduplicate
      const seen = new Set<string>();
      const allSources: ResearchSource[] = [];
      for (const results of searchResults) {
        for (const source of results) {
          if (!seen.has(source.url)) {
            seen.add(source.url);
            allSources.push(source);
          }
        }
      }
      allSources.sort((a, b) => b.relevanceScore - a.relevanceScore);
      const topSources = allSources.slice(0, depthConfig.maxSources);

      if (topSources.length === 0) {
        return {
          contextDelta: { [resultKey]: { summary: "Keine relevanten Quellen gefunden", fullReport: "", sources: [], confidence: 0, depth, layer, queriesUsed: queries, totalDurationMs: Date.now() - startTime } },
          success: false,
          error: "Keine relevanten Quellen gefunden",
        };
      }

      // 2d. Fetch and read top pages
      onProgress?.(`Found ${topSources.length} sources. Reading pages...`);
      const pageUrls = topSources.map((s) => s.url);
      const pages = await fetchMultiplePages(pageUrls, 5);
      onProgress?.(`Read ${pages.length} pages. Synthesizing findings...`);

      // 2e. Synthesize with Haiku (fast + cheap)
      const synthesis = await synthesizeWithClaude(
        HAIKU_MODEL,
        language === "de" ? `${topic} (antworte auf Deutsch)` : topic,
        pages.length > 0 ? pages : topSources.map((s) => ({
          url: s.url,
          title: s.title,
          snippet: s.snippet,
          data: {},
          extractedText: s.snippet,
          confidence: s.relevanceScore,
          method: "search",
          durationMs: 0,
          fieldsFound: [],
        })),
        "concise",
      );

      onProgress?.("Research synthesis completed.");

      const result: ResearchResult = {
        summary: synthesis.summary,
        fullReport: synthesis.fullReport,
        sources: topSources,
        confidence: synthesis.confidence,
        depth,
        layer: "search",
        queriesUsed: queries,
        totalDurationMs: Date.now() - startTime,
        resultType: "research",
        followUpQuestions: synthesis.followUpQuestions,
      };

      return {
        contextDelta: { [resultKey]: result },
        success: true,
        meta: {
          layer: "search",
          depth,
          sourcesFound: topSources.length,
          pagesRead: pages.length,
          queriesUsed: queries.length,
          confidence: synthesis.confidence,
          totalDurationMs: result.totalDurationMs,
          model: HAIKU_MODEL,
        },
      };
    }

    // ═══ LAYER 3: Deep Dive ═══
    if (!process.env.PERPLEXITY_API_KEY && !process.env.SERPER_API_KEY) {
      return { contextDelta: {}, success: false, error: "Weder PERPLEXITY_API_KEY noch SERPER_API_KEY konfiguriert" };
    }

    // 3a. Generate diverse search queries
    onProgress?.("📊 Deep research — planning analysis...");
    const queries = await generateSearchQueries(topic, depthConfig.queries);
    onProgress?.(`Generated ${queries.length} research angles.`);

    // 3b. Search in parallel
    const sourcesPerQuery = Math.ceil(depthConfig.maxSources / queries.length);
    const searchResults = await Promise.all(
      queries.map(async (q) => {
        onProgress?.(`Searching: ${q}`);
        return searchPerplexity(q, sourcesPerQuery).catch(() => [] as ResearchSource[]);
      }),
    );

    // 3c. Deduplicate and rank
    const seen = new Set<string>();
    const allSources: ResearchSource[] = [];
    for (const results of searchResults) {
      for (const source of results) {
        if (!seen.has(source.url)) {
          seen.add(source.url);
          allSources.push(source);
        }
      }
    }
    allSources.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topSources = allSources.slice(0, depthConfig.maxSources);
    onProgress?.(`Collected ${topSources.length} sources. Reading pages...`);

    // 3d. Fetch top pages (first wave)
    const firstWaveUrls = topSources.slice(0, 10).map((s) => s.url);
    const firstWavePages = await fetchMultiplePages(firstWaveUrls, 5);
    onProgress?.(`Read ${firstWavePages.length} pages. Following promising links...`);

    // 3e. Follow links (second wave)
    const additionalUrls = extractLinksFromPages(firstWavePages, topic);
    const secondWavePages = await fetchMultiplePages(additionalUrls.slice(0, 5), 5);
    if (secondWavePages.length > 0) {
      onProgress?.(`Deep-dived into ${secondWavePages.length} additional sources.`);
    }

    // 3f. Merge all pages
    const allPages = [...firstWavePages, ...secondWavePages];
    onProgress?.(`Analyzing ${allPages.length} pages with Sonnet...`);

    // Add second-wave sources to the source list
    for (const page of secondWavePages) {
      if (!seen.has(page.url)) {
        seen.add(page.url);
        topSources.push({
          url: page.url,
          title: page.title,
          snippet: page.snippet,
          relevanceScore: page.confidence,
          domain: extractDomainTitle(page.url),
        });
      }
    }

    // 3g. Synthesize with Sonnet (comprehensive)
    const synthesis = await synthesizeWithClaude(
      SONNET_MODEL,
      language === "de" ? `${topic} (antworte auf Deutsch)` : topic,
      allPages.length > 0 ? allPages : topSources.map((s) => ({
        url: s.url,
        title: s.title,
        snippet: s.snippet,
        data: {},
        extractedText: s.snippet,
        confidence: s.relevanceScore,
        method: "search",
        durationMs: 0,
        fieldsFound: [],
      })),
      "comprehensive",
    );

    onProgress?.("Deep research synthesis completed.");

    const result: ResearchResult = {
      summary: synthesis.summary,
      fullReport: synthesis.fullReport,
      sources: topSources,
      confidence: synthesis.confidence,
      depth: "deep",
      layer: "deep",
      queriesUsed: queries,
      totalDurationMs: Date.now() - startTime,
      resultType: "research",
      followUpQuestions: synthesis.followUpQuestions,
    };

    return {
      contextDelta: { [resultKey]: result },
      success: true,
      meta: {
        layer: "deep",
        depth: "deep",
        sourcesFound: topSources.length,
        pagesRead: allPages.length,
        secondWavePages: secondWavePages.length,
        queriesUsed: queries.length,
        confidence: synthesis.confidence,
        totalDurationMs: result.totalDurationMs,
        model: SONNET_MODEL,
      },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Deep Research fehlgeschlagen",
      meta: { layer, depth, topic, totalDurationMs: Date.now() - startTime },
    };
  }
}
