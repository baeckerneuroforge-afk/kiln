import type {
  QuickUseResult,
  QuickUseResultType,
  QuickUseSource,
  QuickUseType,
} from "@/lib/quick-use/types";

interface ExtractedPresentationBlocks {
  markdown: string;
  sources: QuickUseSource[];
  followUpQuestions: string[];
  resultType?: QuickUseResultType;
}

interface EnhanceQuickUseResultOptions {
  quickUseType?: QuickUseType;
  resultType?: QuickUseResultType;
  followUpQuestions?: string[];
  sources?: QuickUseSource[];
  model?: string;
  durationMs?: number;
}

const RESULT_TYPES: QuickUseResultType[] = [
  "comparison",
  "research",
  "price_list",
  "single_fact",
  "list",
  "general",
];

const PRICE_GLOBAL_PATTERN = /(?:[$€£]\s?\d[\d.,]*|\d[\d.,]*\s?(?:eur|usd|gbp|€|\$|£))/gi;
const HEADING_PATTERN = /(^|\n)#{1,3}\s+/m;
const TABLE_PATTERN = /(^|\n)\|.+\|\n\|(?:\s*:?[-]+:?\s*\|)+/m;
const BULLET_PATTERN = /(^|\n)(?:[-*]|\d+\.)\s+/m;

function normalizeUrl(url: string): string {
  try {
    return new URL(url.trim()).href;
  } catch {
    return url.trim();
  }
}

function sourceTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function sourceDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function parseSourceLine(line: string): QuickUseSource | null {
  const trimmed = line.trim().replace(/^[-*]\s+/, "");
  const urlMatch = trimmed.match(/https?:\/\/\S+/i);
  if (!urlMatch) return null;

  const url = normalizeUrl(urlMatch[0]);
  const idMatch = trimmed.match(/^\[(\d+)\]/);
  const remainder = trimmed
    .replace(/^\[(\d+)\]\s*/, "")
    .replace(urlMatch[0], "")
    .replace(/^\s*[-:]\s*/, "")
    .trim();

  return {
    ...(idMatch ? { id: Number(idMatch[1]) } : {}),
    title: remainder || sourceTitleFromUrl(url),
    url,
    domain: sourceDomain(url),
  };
}

function dedupeSources(sources: QuickUseSource[]): QuickUseSource[] {
  const seen = new Map<string, QuickUseSource>();

  for (const source of sources) {
    const normalizedUrl = normalizeUrl(source.url);
    if (!normalizedUrl) continue;

    const existing = seen.get(normalizedUrl);
    if (existing) {
      seen.set(normalizedUrl, {
        ...existing,
        id: existing.id ?? source.id,
        title: existing.title || source.title || sourceTitleFromUrl(normalizedUrl),
        domain: existing.domain || source.domain || sourceDomain(normalizedUrl),
        snippet: existing.snippet || source.snippet,
      });
      continue;
    }

    seen.set(normalizedUrl, {
      id: source.id,
      title: source.title || sourceTitleFromUrl(normalizedUrl),
      url: normalizedUrl,
      domain: source.domain || sourceDomain(normalizedUrl),
      snippet: source.snippet,
    });
  }

  return Array.from(seen.values()).map((source, index) => ({
    ...source,
    id: source.id ?? index + 1,
  }));
}

export function extractPresentationBlocks(markdown?: string): ExtractedPresentationBlocks {
  if (!markdown) {
    return { markdown: "", sources: [], followUpQuestions: [] };
  }

  let cleaned = markdown.trim();
  const followUpQuestions: string[] = [];
  const sources: QuickUseSource[] = [];
  let explicitResultType: QuickUseResultType | undefined;

  const resultTypeMatch = cleaned.match(/(?:^|\n)RESULT_TYPE:\s*(comparison|research|price_list|single_fact|list|general)\s*$/im);
  if (resultTypeMatch) {
    explicitResultType = resultTypeMatch[1] as QuickUseResultType;
    cleaned = cleaned.replace(resultTypeMatch[0], "").trim();
  }

  const followUpMatch = cleaned.match(/(?:^|\n)FOLLOW_UP_QUESTIONS:\s*\n([\s\S]*?)(?=\nSources:\s*\n|$)/i);
  if (followUpMatch) {
    const lines = followUpMatch[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      const question = line.replace(/^[-*]\s+/, "").trim();
      if (question) followUpQuestions.push(question.replace(/[.?!]+\s*$/, "?"));
    }
    cleaned = cleaned.replace(followUpMatch[0], "").trim();
  }

  const sourcesMatch = cleaned.match(/(?:^|\n)Sources:\s*\n([\s\S]*?)(?=\nFOLLOW_UP_QUESTIONS:\s*\n|$)/i);
  if (sourcesMatch) {
    const lines = sourcesMatch[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      const parsed = parseSourceLine(line);
      if (parsed) sources.push(parsed);
    }
    cleaned = cleaned.replace(sourcesMatch[0], "").trim();
  }

  return {
    markdown: cleaned,
    sources: dedupeSources(sources),
    followUpQuestions: Array.from(new Set(followUpQuestions)).slice(0, 4),
    ...(explicitResultType ? { resultType: explicitResultType } : {}),
  };
}

export function detectQuickUseResultType(input: {
  markdown?: string;
  summary?: string;
  data?: unknown;
  explicitResultType?: QuickUseResultType;
}): QuickUseResultType {
  if (input.explicitResultType && RESULT_TYPES.includes(input.explicitResultType)) {
    return input.explicitResultType;
  }

  const summary = (input.summary || "").trim();
  const markdown = (input.markdown || "").trim();
  const combined = `${summary}\n${markdown}`.trim();
  const priceMatches = combined.match(PRICE_GLOBAL_PATTERN) || [];

  if (TABLE_PATTERN.test(markdown)) {
    if (/price|availability|shipping|delivery|rating/i.test(markdown)) {
      return priceMatches.length >= 2 ? "comparison" : "price_list";
    }
    return "comparison";
  }

  if (HEADING_PATTERN.test(markdown)) {
    return "research";
  }

  if (priceMatches.length >= 2) {
    return "price_list";
  }

  if (BULLET_PATTERN.test(markdown)) {
    return "list";
  }

  if (summary.length > 0 && summary.length <= 180 && markdown.length <= 280) {
    return "single_fact";
  }

  return "general";
}

function subjectFromResult(result: QuickUseResult): string {
  const source = result.title || result.summary || "";
  return source
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

function buildDefaultFollowUps(resultType: QuickUseResultType, result: QuickUseResult, quickUseType?: QuickUseType): string[] {
  const subject = subjectFromResult(result) || "this";

  switch (resultType) {
    case "comparison":
      return [
        `Which option is the best value for ${subject}?`,
        `Can you compare delivery speed and return policies?`,
        "What are the main tradeoffs between the top two options?",
        "Can you turn this into a spreadsheet?",
      ];
    case "price_list":
      return [
        `Which seller offers the fastest delivery for ${subject}?`,
        "Are there any current coupon codes or bundle deals?",
        "Can you compare warranty and return policies?",
        "Track this price and alert me if it drops.",
      ];
    case "research":
      return [
        `What are the biggest risks or open questions around ${subject}?`,
        "How does this compare to the closest alternative?",
        "What should I do next based on these findings?",
        "Can you turn this into an executive brief?",
      ];
    case "list":
      return [
        `Can you rank these options by impact for ${subject}?`,
        "Which choice is best for a small team?",
        "Can you compare the top two in more detail?",
        "Create a summary table from this list.",
      ];
    case "single_fact":
      return [
        `Can you verify ${subject} with another source?`,
        "What is the most important related detail to check next?",
        "Can you explain the tradeoffs behind this answer?",
      ];
    default:
      if (quickUseType === "computer-use") {
        return [
          "Can you open the next relevant page and keep going?",
          "Can you verify this on another site?",
          "Can you extract the details into a table?",
        ];
      }
      return [
        `What should I compare next for ${subject}?`,
        "Can you summarize the key takeaways in one table?",
        "What is the strongest counterpoint or risk here?",
      ];
  }
}

export function urlsToSources(urls: string[]): QuickUseSource[] {
  const mappedSources: QuickUseSource[] = [];

  urls.forEach((url, index) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    mappedSources.push({
      id: index + 1,
      title: sourceTitleFromUrl(normalized),
      url: normalized,
      domain: sourceDomain(normalized),
    });
  });

  return dedupeSources(mappedSources);
}

export function enhanceQuickUseResult(
  result: QuickUseResult,
  options?: EnhanceQuickUseResultOptions
): QuickUseResult {
  const extracted = extractPresentationBlocks(result.markdown);
  const explicitSources = dedupeSources([...(result.sources || []), ...(options?.sources || []), ...extracted.sources]);
  const resultType = detectQuickUseResultType({
    markdown: extracted.markdown || result.markdown,
    summary: result.summary,
    data: result.data,
    explicitResultType: options?.resultType || result.resultType || extracted.resultType,
  });
  const followUpQuestions = Array.from(
    new Set([
      ...(result.followUpQuestions || []),
      ...(options?.followUpQuestions || []),
      ...extracted.followUpQuestions,
    ])
  ).filter(Boolean);

  return {
    ...result,
    markdown: extracted.markdown || result.markdown,
    resultType,
    sources: explicitSources,
    followUpQuestions: followUpQuestions.length > 0
      ? followUpQuestions.slice(0, 4)
      : buildDefaultFollowUps(resultType, result, options?.quickUseType).slice(0, 4),
    model: result.model || options?.model,
    durationMs: result.durationMs || options?.durationMs,
  };
}
