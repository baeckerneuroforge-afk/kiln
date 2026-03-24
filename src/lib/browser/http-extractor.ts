/**
 * HTTP Extractor — Fast web data extraction without a browser.
 * Fetches pages via HTTP, extracts structured data from raw HTML.
 * Used by Deep Research for Layer 1 (instant) and Layer 2 (page reading).
 *
 * ~200ms per page, 0 credits, no browser session.
 */

import { safeFetch } from "@/lib/url-validation";
import { SmartExtractor } from "./smart-extractor";
import { getRecipeForUrl } from "./site-recipes";

/* ── Types ── */

export interface PageResult {
  url: string;
  title: string;
  snippet: string;
  data: Record<string, unknown>;
  extractedText: string;
  confidence: number;
  method: string;
  durationMs: number;
  fieldsFound: string[];
}

/* ── Constants ── */

const HTTP_TIMEOUT = 10000;
const MAX_HTML_SIZE = 500_000; // 500KB — skip huge pages
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/* ── Single Page Fetch + Extract ── */

/**
 * Fetches a single URL and extracts structured data from its HTML.
 * Returns null if fetch fails or page is not extractable.
 */
export async function httpFetchAndExtract(
  url: string,
  fields?: string[],
): Promise<PageResult | null> {
  const start = Date.now();

  try {
    const response = await safeFetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT),
    });

    if (!response.ok) return null;

    const html = await response.text();
    if (html.length < 200 || html.length > MAX_HTML_SIZE) return null;

    // Skip JS-only pages
    if (html.includes("Enable JavaScript") || html.includes("You need to enable JavaScript")) {
      return null;
    }

    // Determine fields: explicit or common defaults
    const extractFields = fields && fields.length > 0
      ? fields
      : ["title", "description", "price", "availability", "rating", "brand"];

    // Try recipe-based extraction first for known sites
    const recipeMatch = getRecipeForUrl(url);
    let recipeData: Record<string, unknown> = {};
    if (recipeMatch?.recipe.product) {
      recipeData = extractWithRecipeSelectors(html, recipeMatch.recipe.product);
    }

    // SmartExtractor on raw HTML
    const extraction = SmartExtractor.extractFromHtml(html, url, extractFields);

    // Merge recipe data (recipe wins on conflicts since selectors are curated)
    const mergedData = { ...extraction.data, ...recipeData };
    const allFieldsFound = [...new Set([
      ...extraction.fieldsFound,
      ...Object.keys(recipeData).filter((k) => recipeData[k]),
    ])];

    // Extract readable text for synthesis
    const extractedText = extractReadableText(html);

    // Extract title
    const title = String(mergedData.title || extractTitleFromHtml(html) || url);

    // Extract snippet
    const snippet = String(
      mergedData.description || extractedText.slice(0, 300) || "",
    );

    const confidence = recipeData && Object.keys(recipeData).length > 0
      ? Math.min(0.95, extraction.confidence + 0.1)
      : extraction.confidence;

    return {
      url,
      title: title.slice(0, 200),
      snippet: snippet.slice(0, 500),
      data: mergedData,
      extractedText: extractedText.slice(0, 5000),
      confidence,
      method: Object.keys(recipeData).length > 0 ? "recipe+html" : extraction.method,
      durationMs: Date.now() - start,
      fieldsFound: allFieldsFound,
    };
  } catch {
    return null;
  }
}

/* ── Parallel Page Fetcher ── */

/**
 * Fetches multiple URLs in parallel batches.
 * Returns only successful results, skips failures.
 */
export async function fetchMultiplePages(
  urls: string[],
  maxConcurrent = 5,
  fields?: string[],
): Promise<PageResult[]> {
  const results: PageResult[] = [];

  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(
      batch.map((url) => httpFetchAndExtract(url, fields)),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
      }
    }
  }

  return results;
}

/* ── URL Extraction from HTML ── */

/**
 * Extracts promising follow-up links from fetched pages.
 * Filters for relevance to the query.
 */
export function extractLinksFromPages(
  pages: PageResult[],
  query: string,
): string[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
  const seen = new Set(pages.map((p) => p.url));
  const links: Array<{ url: string; score: number }> = [];

  for (const page of pages) {
    // Extract links from the page text (URLs are preserved in extractedText)
    const urlMatches = page.extractedText.match(/https?:\/\/[^\s"'<>)]+/g) || [];

    for (const rawUrl of urlMatches) {
      // Clean URL
      const url = rawUrl.replace(/[.,;:!?]+$/, "");
      if (seen.has(url)) continue;

      try {
        const parsed = new URL(url);
        // Skip non-content URLs
        if (/\.(css|js|png|jpg|gif|svg|ico|woff|pdf)$/i.test(parsed.pathname)) continue;
        if (parsed.hostname.includes("facebook.com") || parsed.hostname.includes("twitter.com")) continue;

        // Score by query term overlap with URL path
        const urlLower = url.toLowerCase();
        const score = queryTerms.filter((t) => urlLower.includes(t)).length;

        if (score > 0) {
          seen.add(url);
          links.push({ url, score });
        }
      } catch {
        continue;
      }
    }
  }

  return links
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((l) => l.url);
}

/* ── Helpers ── */

/**
 * Extracts data using recipe CSS selectors on raw HTML via regex.
 * Not as reliable as a real DOM, but works for well-structured HTML.
 */
function extractWithRecipeSelectors(
  html: string,
  selectors: Record<string, string>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (const [field, selectorStr] of Object.entries(selectors)) {
    // Try each comma-separated selector
    const sels = selectorStr.split(",").map((s) => s.trim());

    for (const sel of sels) {
      const value = extractBySelector(html, sel);
      if (value) {
        data[field] = value;
        break;
      }
    }
  }

  return data;
}

/**
 * Attempts to extract text content matching a CSS selector from raw HTML.
 * Limited to simple selectors: #id, .class, [attr], tag.
 */
function extractBySelector(html: string, selector: string): string | null {
  // ID selector: #productTitle
  const idMatch = selector.match(/^#([\w-]+)$/);
  if (idMatch) {
    const regex = new RegExp(`id\\s*=\\s*["']${idMatch[1]}["'][^>]*>([^<]*)`, "i");
    const match = html.match(regex);
    if (match) return match[1].trim().slice(0, 500) || null;
  }

  // Attribute selector: [data-test="product-title"]
  const attrMatch = selector.match(/^\[([\w-]+)\s*=\s*["']([^"']+)["']\]$/);
  if (attrMatch) {
    const regex = new RegExp(`${attrMatch[1]}\\s*=\\s*["']${attrMatch[2]}["'][^>]*>([^<]*)`, "i");
    const match = html.match(regex);
    if (match) return match[1].trim().slice(0, 500) || null;
  }

  return null;
}

/**
 * Extracts readable text from HTML, stripping tags and scripts.
 */
function extractReadableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
}

/**
 * Extracts the page title from HTML.
 */
function extractTitleFromHtml(html: string): string | null {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].replace(/<[^>]+>/g, "").trim().slice(0, 200) || null;
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 200) || null;
  }

  return null;
}
