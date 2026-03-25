/**
 * Chat Web Search — Real-time web fallback for agent chat
 * When KB chunks are insufficient, searches the web to supplement the answer.
 *
 * Rate limits:
 * - Max 3 web searches per chat session
 * - Max 10 web searches per agent per hour
 *
 * Credit cost: 1 credit per web-enhanced response (skipped for BYOK)
 */

import { webSearchWithFallbackChain, type SearchResult } from "@/lib/execution/web-search-chain";
import { safeFetch } from "@/lib/url-validation";

/* ── Types ── */

export interface RagChunk {
  content: string;
  similarity: number;
}

export interface WebSearchContext {
  searchResults: SearchResult | null;
  fetchedSnippets: { url: string; text: string }[];
  used: boolean;
}

export interface KbSufficiencyCheck {
  sufficient: boolean;
  topSimilarity: number;
  hasKeywordOverlap: boolean;
  chunkCount: number;
}

/* ── Rate Limiting (in-memory) ── */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Session-level: max 3 per session
const sessionLimits = new Map<string, number>();

// Agent-level: max 10 per hour
const agentLimits = new Map<string, RateLimitEntry>();

const MAX_PER_SESSION = 3;
const MAX_PER_AGENT_HOUR = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;

function isRateLimited(agentId: string, sessionId: string): boolean {
  // Session limit
  const sessionKey = `${agentId}:${sessionId}`;
  const sessionCount = sessionLimits.get(sessionKey) || 0;
  if (sessionCount >= MAX_PER_SESSION) return true;

  // Agent hourly limit
  const agentEntry = agentLimits.get(agentId);
  if (agentEntry) {
    if (Date.now() > agentEntry.resetAt) {
      agentLimits.set(agentId, { count: 0, resetAt: Date.now() + ONE_HOUR_MS });
    } else if (agentEntry.count >= MAX_PER_AGENT_HOUR) {
      return true;
    }
  }

  return false;
}

function recordSearch(agentId: string, sessionId: string): void {
  // Session
  const sessionKey = `${agentId}:${sessionId}`;
  sessionLimits.set(sessionKey, (sessionLimits.get(sessionKey) || 0) + 1);

  // Agent hourly
  const agentEntry = agentLimits.get(agentId);
  if (agentEntry && Date.now() <= agentEntry.resetAt) {
    agentEntry.count++;
  } else {
    agentLimits.set(agentId, { count: 1, resetAt: Date.now() + ONE_HOUR_MS });
  }
}

// Cleanup stale entries periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of agentLimits) {
    if (now > entry.resetAt + ONE_HOUR_MS) agentLimits.delete(key);
  }
  // Session limits: clear entries older than 1 hour (sessions are short-lived)
  if (sessionLimits.size > 1000) sessionLimits.clear();
}, 10 * 60 * 1000).unref?.();

/* ── KB Sufficiency Check ── */

/**
 * Bestimmt ob die KB-Chunks die Frage ausreichend beantworten.
 */
export function checkKbSufficiency(
  chunks: RagChunk[],
  userMessage: string,
): KbSufficiencyCheck {
  if (chunks.length === 0) {
    return { sufficient: false, topSimilarity: 0, hasKeywordOverlap: false, chunkCount: 0 };
  }

  const topSimilarity = chunks[0].similarity;

  // Keyword-Overlap prüfen
  const keywords = userMessage
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter((w) => !QUESTION_STOP_WORDS.has(w));

  const combinedContent = chunks.map((c) => c.content.toLowerCase()).join(" ");
  const matchingKeywords = keywords.filter((kw) => combinedContent.includes(kw));
  const hasKeywordOverlap = keywords.length > 0
    ? matchingKeywords.length / keywords.length >= 0.4
    : true; // Wenn keine Keywords extrahiert werden können → konservativ

  const sufficient = topSimilarity >= 0.8 && hasKeywordOverlap;

  return { sufficient, topSimilarity, hasKeywordOverlap, chunkCount: chunks.length };
}

const QUESTION_STOP_WORDS = new Set([
  "what", "where", "when", "which", "who", "whom", "whose", "why", "how",
  "does", "have", "been", "this", "that", "these", "those", "there", "their",
  "your", "about", "from", "with", "some", "they", "them", "than", "then",
  "also", "more", "much", "many", "very", "just", "only", "even", "most",
  "well", "like", "want", "need", "know", "tell", "please", "could", "would",
  "should", "shall", "will", "does", "help", "make", "give",
  // German
  "was", "wann", "warum", "wie", "welche", "welcher", "welches", "wer", "wem",
  "gibt", "kann", "sind", "haben", "eine", "einen", "einem", "einer", "dieser",
  "diese", "dieses", "bitte", "noch", "auch", "mehr", "sehr", "schon", "über",
]);

/* ── Web Search für Chat ── */

/**
 * Führt eine Web-Suche für den Chat aus.
 * Timeout: max 5 Sekunden für alles (Suche + Fetch).
 */
export async function searchWebForChat(
  userMessage: string,
  agentId: string,
  sessionId: string,
): Promise<WebSearchContext> {
  const empty: WebSearchContext = { searchResults: null, fetchedSnippets: [], used: false };

  if (isRateLimited(agentId, sessionId)) {
    return empty;
  }

  try {
    // Gesamtes Budget: 5 Sekunden
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const searchResults = await webSearchWithFallbackChain(userMessage, 5);

      if (!searchResults.success || searchResults.results.length === 0) {
        return empty;
      }

      recordSearch(agentId, sessionId);

      // Top 2 URLs fetchen für mehr Kontext
      const fetchedSnippets: { url: string; text: string }[] = [];
      const urlsToFetch = searchResults.results
        .slice(0, 2)
        .map((r) => r.url)
        .filter(Boolean);

      await Promise.allSettled(
        urlsToFetch.map(async (url) => {
          try {
            const response = await safeFetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; KilnBot/1.0)" },
              signal: controller.signal,
            });
            if (response.ok) {
              const html = await response.text();
              // Groben Text extrahieren
              const text = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .substring(0, 1500);
              if (text.length > 100) {
                fetchedSnippets.push({ url, text });
              }
            }
          } catch {
            // Einzelner Fetch fehlgeschlagen — OK
          }
        })
      );

      return { searchResults, fetchedSnippets, used: true };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return empty;
  }
}

/* ── Kontext-Builder ── */

/**
 * Baut den Web-Search-Kontext-String für den System-Prompt.
 */
export function buildWebSearchContext(webSearch: WebSearchContext): string {
  if (!webSearch.used || !webSearch.searchResults) return "";

  const parts: string[] = [];

  parts.push("\n\n--- WEB SEARCH RESULTS (supplementary) ---");

  // Search-Ergebnisse
  for (const result of webSearch.searchResults.results.slice(0, 5)) {
    parts.push(`[${result.title}](${result.url})`);
    if (result.snippet) parts.push(result.snippet);
    parts.push("");
  }

  // Gefechtete Inhalte
  for (const snippet of webSearch.fetchedSnippets) {
    parts.push(`From ${snippet.url}:`);
    parts.push(snippet.text);
    parts.push("");
  }

  parts.push("--- END WEB SEARCH ---");

  parts.push(`
IMPORTANT: Your knowledge base didn't fully cover this question. Web search results are provided as supplementary information. When answering:
- Clearly indicate what comes from your knowledge base vs web search
- Prefer knowledge base information when both sources cover the same topic
- For web-sourced information, mention it's from external sources
- Never present web search results as if they're from the knowledge base`);

  return parts.join("\n");
}

/**
 * Anti-Halluzination: Zusätzliche Instruktion wenn KB leer + kein Web-Ergebnis.
 */
export function buildNoInfoGuard(): string {
  return `
If you cannot find the answer in your knowledge base AND no web search results are available:
- Say clearly: "I don't have specific information about this in my knowledge base."
- If web search provided relevant results, share them with a note: "Based on publicly available information..."
- If neither source has the answer, suggest the user contact the business directly.
- NEVER make up information, prices, or details.`;
}
