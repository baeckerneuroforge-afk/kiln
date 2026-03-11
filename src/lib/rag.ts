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

// Embedding with OpenAI text-embedding-ada-002
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: "text-embedding-ada-002",
    input: text.trim(),
  });
  return response.data[0].embedding;
}

// Embed multiple chunks (batch)
export async function generateEmbeddings(
  chunks: string[]
): Promise<number[][]> {
  const response = await getOpenAI().embeddings.create({
    model: "text-embedding-ada-002",
    input: chunks.map((c) => c.trim()),
  });
  return response.data.map((d) => d.embedding);
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

// Fetch URL content
export async function fetchUrlContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "KILN-Bot/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load URL: ${response.status}`);
  }

  const html = await response.text();

  // Simple HTML-to-text (without external dependency)
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
