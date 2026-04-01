import OpenAI from "openai";
import { getSupabaseAdmin } from "./supabase";

// Lazy init to avoid build-time errors
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured in .env.local");
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// Split text into chunks (with overlap)
export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + " " + sentence).length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      // Overlap: keep last sentences
      const words = currentChunk.split(" ");
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = overlapWords.join(" ") + " " + sentence;
    } else {
      currentChunk = currentChunk ? currentChunk + " " + sentence : sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 20;

// Embedding with OpenAI text-embedding-3-small
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim(),
  });
  return response.data[0].embedding;
}

// Embed multiple chunks (single API call — use for small sets)
export async function generateEmbeddings(
  chunks: string[]
): Promise<number[][]> {
  const response = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: chunks.map((c) => c.trim()),
  });
  return response.data.map((d) => d.embedding);
}

/**
 * Process chunks in batches with progressive callback.
 * Each batch of up to 20 chunks is embedded in one API call, then
 * onBatchDone is called so the caller can save immediately.
 * Returns total chunks processed (may be less than chunks.length if aborted).
 */
export async function generateEmbeddingsBatched(
  chunks: string[],
  onBatchDone: (batchChunks: string[], batchEmbeddings: number[][], batchStartIndex: number) => Promise<void>,
  abortSignal?: AbortSignal,
): Promise<number> {
  let processed = 0;

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    if (abortSignal?.aborted) {
      console.warn(`[RAG] Batch loop aborted at index ${i}`);
      break;
    }

    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    let embeddings: number[][];

    try {
      const response = await getOpenAI().embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch.map((c) => c.trim()),
      });
      embeddings = response.data.map((d) => d.embedding);
    } catch (apiErr) {
      const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
      console.warn(`[RAG] OpenAI embedding API error at batch ${i}: ${msg}`);
      throw apiErr;
    }

    await onBatchDone(batch, embeddings, i);
    processed += batch.length;
  }

  return processed;
}

// Store chunks with embeddings in Supabase pgvector
export async function storeChunks(
  knowledgeBaseId: string,
  agentId: string,
  chunks: string[],
  embeddings: number[][]
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const rows = chunks.map((content, i) => ({
    knowledge_base_id: knowledgeBaseId,
    agent_id: agentId,
    content,
    embedding: JSON.stringify(embeddings[i]),
    chunk_index: i,
  }));

  const { error } = await supabase.from("knowledge_chunks").insert(rows);

  if (error) {
    throw new Error(`Error saving chunks: ${error.message}`);
  }
}

// Search relevant chunks (semantic search)
export async function searchRelevantChunks(
  agentId: string,
  query: string,
  limit: number = 5
): Promise<{ content: string; similarity: number }[]> {
  const supabase = getSupabaseAdmin();
  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_agent_id: agentId,
    match_threshold: 0.7,
    match_count: limit,
  });

  if (error) {
    console.error("RAG search failed:", error.message);
    return [];
  }

  return (data || []).map((row: { content: string; similarity: number }) => ({
    content: row.content,
    similarity: row.similarity,
  }));
}

// Search chunks from both agent KB and team KB (combined, deduplicated)
export async function searchRelevantChunksMulti(
  agentId: string,
  teamId: string | null,
  query: string,
  limit: number = 8
): Promise<{ content: string; similarity: number; sourceType: "agent" | "team" }[]> {
  if (!teamId) {
    const results = await searchRelevantChunks(agentId, query, limit);
    return results.map((r) => ({ ...r, sourceType: "agent" as const }));
  }

  const supabase = getSupabaseAdmin();
  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc("match_knowledge_chunks_multi", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_agent_id: agentId,
    match_team_id: teamId,
    match_threshold: 0.7,
    match_count: limit,
  });

  if (error) {
    console.error("RAG multi-search failed:", error.message);
    // Fallback to agent-only search
    const results = await searchRelevantChunks(agentId, query, limit);
    return results.map((r) => ({ ...r, sourceType: "agent" as const }));
  }

  // Deduplicate by content
  const seen = new Set<string>();
  return (data || [])
    .filter((row: { content: string }) => {
      const key = row.content.slice(0, 200);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row: { content: string; similarity: number; source_type: string }) => ({
      content: row.content,
      similarity: row.similarity,
      sourceType: (row.source_type === "team" ? "team" : "agent") as "agent" | "team",
    }));
}

// Store chunks with team_id for team-level KB
export async function storeTeamChunks(
  knowledgeBaseId: string,
  teamId: string,
  chunks: string[],
  embeddings: number[][]
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const rows = chunks.map((content, i) => ({
    knowledge_base_id: knowledgeBaseId,
    agent_id: `team_${teamId}`,
    team_id: teamId,
    content,
    embedding: JSON.stringify(embeddings[i]),
    chunk_index: i,
  }));

  const { error } = await supabase.from("knowledge_chunks").insert(rows);

  if (error) {
    throw new Error(`Error saving team chunks: ${error.message}`);
  }
}

// Fetch URL content (with SSRF protection)
export async function fetchUrlContent(url: string): Promise<string> {
  const { safeFetch, readResponseWithLimit } = await import("@/lib/url-validation");

  let response: Response;
  try {
    response = await safeFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        DNT: "1",
      },
      redirect: "follow",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to fetch URL: ${msg}`);
  }

  if (!response.ok) {
    const statusText = response.statusText || "Unknown";
    throw new Error(
      `Could not fetch URL (HTTP ${response.status} ${statusText}). Make sure the URL is publicly accessible.`
    );
  }

  let html: string;
  try {
    html = await readResponseWithLimit(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to read response: ${msg}`);
  }

  if (!html || html.length < 50) {
    throw new Error("The URL returned empty or very little content.");
  }

  // Extract text from HTML — strip non-content elements first, then tags
  const text = html
    // Remove script/style/svg blocks
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Strip all remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 20) {
    throw new Error(
      "The URL returned a page but no meaningful text content could be extracted. The page may use JavaScript rendering."
    );
  }

  return text;
}
