/**
 * Web Search Priority Chain
 * Reduces third-party dependency by using learned URLs and free search fallbacks.
 *
 * Priority:
 * 1. Known URLs from SiteIntelligence DB (free, instant)
 * 2. Perplexity Search API (paid, best quality)
 * 3. Serper.dev / Google Search API (paid fallback)
 * 4. Google HTML scraping (free, best-effort)
 * 5. DuckDuckGo HTML scraping (free, rarely blocks)
 * 6. "Search unavailable" with fetch_url hint
 */

import { prisma } from "@/lib/prisma";
import { safeFetch } from "@/lib/url-validation";

/* ── Types ── */

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: {
    source: string;
    url: string;
    title: string;
    snippet: string;
    tool: string;
    provider: string;
    verified: boolean;
  };
}

export interface SearchResult {
  success: boolean;
  query: string;
  results: SearchResultItem[];
  synthesis?: string;
  provider: string;
  error?: string;
}

/* ── Stop-Words für Keyword-Extraktion ── */

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "shall", "can", "need", "to", "of", "in", "for", "on", "with",
  "at", "by", "from", "as", "into", "through", "during", "before", "after",
  "above", "below", "between", "and", "but", "or", "nor", "not", "so", "yet",
  "both", "either", "neither", "each", "every", "all", "any", "few", "more",
  "most", "other", "some", "such", "no", "only", "own", "same", "than", "too",
  "very", "just", "because", "what", "which", "who", "whom", "this", "that",
  "these", "those", "my", "your", "his", "her", "its", "our", "their",
  "compare", "vs", "versus", "pricing", "price", "features", "review", "best", "top",
  "wie", "was", "ist", "sind", "der", "die", "das", "ein", "eine", "und", "oder",
  "für", "vergleiche", "vergleich", "preis", "preise", "funktionen", "bewertung", "beste",
]);

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/* ── Keyword Extraction ── */

export function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-zA-Z0-9äöüß\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/* ── Priority 1: Known URLs from SiteIntelligence ── */

export async function getKnownUrlsForQuery(
  query: string,
): Promise<{ url: string; domain: string; confidence: number }[]> {
  try {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return [];

    const results: { url: string; domain: string; confidence: number }[] = [];

    for (const keyword of keywords) {
      const intelligence = await prisma.siteIntelligence.findMany({
        where: {
          dataType: "known_url",
          OR: [
            { domain: { contains: keyword.toLowerCase() } },
            { selectorKey: { contains: keyword.toLowerCase() } },
          ],
          confidence: { gte: 0.6 },
        },
        orderBy: { confidence: "desc" },
        take: 3,
      });

      for (const record of intelligence) {
        if (!results.some((r) => r.url === record.selectorValue)) {
          results.push({
            url: record.selectorValue,
            domain: record.domain,
            confidence: record.confidence,
          });
        }
      }
    }

    return results.slice(0, 5);
  } catch {
    return [];
  }
}

async function searchKnownUrls(query: string, numResults: number): Promise<SearchResult | null> {
  const knownUrls = await getKnownUrlsForQuery(query);
  if (knownUrls.length === 0) return null;

  const items: SearchResultItem[] = [];

  for (const known of knownUrls.slice(0, numResults)) {
    try {
      const response = await safeFetch(known.url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;

      const html = await response.text();
      const cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      // Titel aus <title> Tag extrahieren
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : known.domain;

      items.push({
        title,
        url: known.url,
        snippet: cleaned.slice(0, 300),
        source: {
          source: "known_url",
          url: known.url,
          title,
          snippet: cleaned.slice(0, 200),
          tool: "web_search",
          provider: "known_urls",
          verified: true,
        },
      });
    } catch {
      // URL nicht erreichbar — weiter
    }
  }

  if (items.length === 0) return null;

  return {
    success: true,
    query,
    results: items,
    provider: "known_urls",
  };
}

/* ── Priority 2: Perplexity Search API ── */

async function searchPerplexity(query: string, numResults: number): Promise<SearchResult | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "Return concise search results. For each result include the URL, title, and a brief snippet." },
          { role: "user", content: query },
        ],
        max_tokens: 1024,
        return_citations: true,
        search_recency_filter: "month",
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      choices?: Array<{ message: { content: string } }>;
      citations?: string[];
    };
    const citations = data.citations || [];
    const content = data.choices?.[0]?.message?.content || "";

    if (citations.length === 0) return null;

    const items = citations.slice(0, numResults).map((url, i) => {
      let domain = url;
      try { domain = new URL(url).hostname; } catch { /* */ }
      return {
        title: domain,
        url,
        snippet: i === 0 ? content.slice(0, 300) : "",
        source: {
          source: "search_result",
          url,
          title: domain,
          snippet: content.slice(0, 200),
          tool: "web_search",
          provider: "perplexity",
          verified: true,
        },
      };
    });

    return {
      success: true,
      query,
      results: items,
      synthesis: content.slice(0, 1000),
      provider: "perplexity",
    };
  } catch {
    return null;
  }
}

/* ── Priority 3: Serper.dev ── */

async function searchSerper(query: string, numResults: number): Promise<SearchResult | null> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return null;

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: numResults }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      organic?: Array<{ title: string; link: string; snippet: string }>;
    };
    const items = (data.organic || []).slice(0, numResults).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
      source: {
        source: "search_result",
        url: item.link,
        title: item.title,
        snippet: item.snippet,
        tool: "web_search",
        provider: "serper",
        verified: true,
      },
    }));

    if (items.length === 0) return null;
    return { success: true, query, results: items, provider: "serper" };
  } catch {
    return null;
  }
}

/* ── Priority 4: Google HTML Scraping ── */

export function parseGoogleResults(html: string): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const seen = new Set<string>();

  // Google redirects through /url?q=...
  const organicLinks = html.match(/\/url\?q=(https?:\/\/(?!google|youtube|maps|accounts\.google|support\.google|policies\.google)[^&"]+)/gi) || [];
  const titles = html.match(/<h3[^>]*>(.*?)<\/h3>/gi) || [];

  for (let i = 0; i < Math.min(organicLinks.length, 10); i++) {
    const urlMatch = organicLinks[i]?.match(/q=(https?:\/\/[^&"]+)/);
    const url = urlMatch ? decodeURIComponent(urlMatch[1]) : null;
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title = titles[i]?.replace(/<[^>]*>/g, "").trim() || (() => { try { return new URL(url).hostname; } catch { return url; } })();
    items.push({
      title,
      url,
      snippet: "",
      source: {
        source: "search_result",
        url,
        title,
        snippet: "",
        tool: "web_search",
        provider: "google_scrape",
        verified: false,
      },
    });
  }

  return items;
}

async function searchGoogleScrape(query: string, numResults: number): Promise<SearchResult | null> {
  try {
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=de&gl=de&num=10`;
    const response = await fetch(googleUrl, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;
    const html = await response.text();
    const items = parseGoogleResults(html).slice(0, numResults);
    if (items.length === 0) return null;

    return { success: true, query, results: items, provider: "google_scrape" };
  } catch {
    return null;
  }
}

/* ── Priority 5: DuckDuckGo HTML Scraping ── */

export function parseDuckDuckGoResults(html: string): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const seen = new Set<string>();

  // DuckDuckGo HTML hat result__a Links
  const linkRegex = /class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null && items.length < 10) {
    const url = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").trim();
    if (url.startsWith("http") && !seen.has(url)) {
      seen.add(url);
      items.push({
        title,
        url,
        snippet: "",
        source: {
          source: "search_result",
          url,
          title,
          snippet: "",
          tool: "web_search",
          provider: "duckduckgo_scrape",
          verified: false,
        },
      });
    }
  }

  // Fallback: allgemeine HTTP-Links extrahieren
  if (items.length === 0) {
    const links = html.match(/href="(https?:\/\/(?!duckduckgo)[^"]+)"/gi) || [];
    for (const link of links.slice(0, 10)) {
      const urlMatch = link.match(/href="([^"]+)"/);
      const url = urlMatch?.[1];
      if (url && !seen.has(url)) {
        seen.add(url);
        const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
        items.push({
          title: hostname,
          url,
          snippet: "",
          source: {
            source: "search_result",
            url,
            title: hostname,
            snippet: "",
            tool: "web_search",
            provider: "duckduckgo_scrape",
            verified: false,
          },
        });
      }
    }
  }

  return items;
}

async function searchDuckDuckGo(query: string, numResults: number): Promise<SearchResult | null> {
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(ddgUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;
    const html = await response.text();
    const items = parseDuckDuckGoResults(html).slice(0, numResults);
    if (items.length === 0) return null;

    return { success: true, query, results: items, provider: "duckduckgo_scrape" };
  } catch {
    return null;
  }
}

/* ── Main Priority Chain ── */

/**
 * Führt eine Web-Suche mit vollständiger Fallback-Kette durch.
 * Priority: Known URLs → Perplexity → Serper → Google scrape → DuckDuckGo
 */
export async function webSearchWithFallbackChain(
  query: string,
  numResults: number = 5,
): Promise<SearchResult> {
  // Priority 1: Known URLs aus SiteIntelligence (kostenlos, sofort)
  const knownResult = await searchKnownUrls(query, numResults);
  if (knownResult) return knownResult;

  // Priority 2: Perplexity (paid, beste Qualität)
  const perplexityResult = await searchPerplexity(query, numResults);
  if (perplexityResult) return perplexityResult;

  // Priority 3: Serper.dev (paid fallback)
  const serperResult = await searchSerper(query, numResults);
  if (serperResult) return serperResult;

  // Priority 4: Google HTML scraping (kostenlos, best-effort)
  const googleResult = await searchGoogleScrape(query, numResults);
  if (googleResult) return googleResult;

  // Priority 5: DuckDuckGo HTML scraping (kostenlos, selten blockiert)
  const ddgResult = await searchDuckDuckGo(query, numResults);
  if (ddgResult) return ddgResult;

  // Alle Provider fehlgeschlagen
  return {
    success: false,
    query,
    results: [],
    provider: "none",
    error: "Search unavailable. Use fetch_url to read specific URLs directly if you know the website.",
  };
}

/* ── URL Learning ── */

/**
 * Lernt eine erfolgreiche URL und speichert sie in SiteIntelligence.
 * Non-blocking, fire-and-forget.
 */
export function learnSuccessfulUrl(fetchedUrl: string, contentLength: number): void {
  if (contentLength < 200) return;

  try {
    const urlObj = new URL(fetchedUrl);
    const domain = urlObj.hostname.replace(/^www\./, "");

    // Seitentyp aus URL-Pfad ableiten
    const pathPatterns: Record<string, RegExp> = {
      pricing: /\/(pricing|plans|preise)/i,
      features: /\/(features|funktionen|product)/i,
      about: /\/(about|impressum|ueber-uns)/i,
      contact: /\/(contact|kontakt)/i,
      docs: /\/(docs|documentation|help)/i,
      blog: /\/(blog|news|artikel)/i,
      careers: /\/(careers|jobs|karriere)/i,
    };

    let pageType = "general";
    for (const [type, regex] of Object.entries(pathPatterns)) {
      if (regex.test(urlObj.pathname)) {
        pageType = type;
        break;
      }
    }

    void prisma.siteIntelligence
      .upsert({
        where: {
          domain_pathPattern_dataType_selectorKey: {
            domain,
            pathPattern: pageType,
            dataType: "known_url",
            selectorKey: `${pageType}_page`,
          },
        },
        update: {
          selectorValue: fetchedUrl,
          successCount: { increment: 1 },
          confidence: { increment: 0.05 },
          lastSeenAt: new Date(),
        },
        create: {
          domain,
          pathPattern: pageType,
          dataType: "known_url",
          selectorKey: `${pageType}_page`,
          selectorValue: fetchedUrl,
          successCount: 1,
          failCount: 0,
          confidence: 0.7,
          source: "auto_learned",
        },
      })
      .catch(() => {}); // Non-blocking
  } catch {
    // Ungültige URL — ignorieren
  }
}

/* ── Deep Research Search Adapter ── */

export interface ResearchSourceCompat {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  domain: string;
}

/**
 * Adapter für Deep Research Node: Gibt Suchergebnisse im ResearchSource-Format zurück.
 * Nutzt die vollständige Fallback-Kette.
 */
export async function searchWithFallbackChainForResearch(
  query: string,
  maxResults: number,
): Promise<ResearchSourceCompat[]> {
  const result = await webSearchWithFallbackChain(query, maxResults);
  if (!result.success || result.results.length === 0) return [];

  return result.results.map((item, i) => ({
    url: item.url,
    title: item.title,
    snippet: item.snippet,
    relevanceScore: Math.max(0.5, 1 - i * 0.08),
    domain: (() => { try { return new URL(item.url).hostname; } catch { return item.url; } })(),
  }));
}
