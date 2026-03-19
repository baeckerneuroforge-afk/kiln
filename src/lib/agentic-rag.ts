/**
 * Agentic RAG — Self-Learning Knowledge Base
 * When an agent can't answer a question, it researches the answer online
 * and suggests adding it to the Knowledge Base for human approval.
 */

import { prisma } from "@/lib/prisma";
// fetchUrlContent reserved for future URL-based research
// import { fetchUrlContent } from "@/lib/rag";

/* ── Uncertainty Detection ── */

const UNCERTAINTY_PHRASES = [
  "i don't know",
  "i am not sure",
  "i'm not sure",
  "i can't help with that",
  "i cannot help with that",
  "i don't have that information",
  "i don't have information about",
  "i'm unable to",
  "i am unable to",
  "unfortunately, i don't",
  "unfortunately, i can't",
  "i don't have enough information",
  "i'm not able to",
  "outside my knowledge",
  "beyond my current knowledge",
  "ich weiss es nicht",
  "ich weiß es nicht",
  "ich bin mir nicht sicher",
  "dabei kann ich nicht helfen",
  "dazu habe ich keine informationen",
  "leider kann ich",
  "das kann ich leider nicht",
  "dazu fehlen mir",
];

export interface KnowledgeGapResult {
  isGap: boolean;
  topic: string;
  originalQuestion: string;
}

/**
 * Analyzes if the agent's response indicates uncertainty.
 * Returns the knowledge gap info if detected.
 */
export function detectKnowledgeGap(
  userMessage: string,
  agentResponse: string
): KnowledgeGapResult {
  const responseLower = agentResponse.toLowerCase();
  const hasUncertainty = UNCERTAINTY_PHRASES.some((phrase) =>
    responseLower.includes(phrase)
  );

  if (!hasUncertainty) {
    return { isGap: false, topic: "", originalQuestion: "" };
  }

  // Extract a topic from the user's question
  const topic = extractTopic(userMessage);

  return {
    isGap: true,
    topic,
    originalQuestion: userMessage.slice(0, 500),
  };
}

/**
 * Extract the core topic from a user message.
 */
function extractTopic(message: string): string {
  // Remove filler words and keep meaningful content
  const cleaned = message
    .replace(/^(hey|hi|hello|hallo|can you|could you|please|bitte|kannst du|könntest du)\s*/i, "")
    .replace(/[?!.]+$/, "")
    .trim();
  return cleaned.slice(0, 200);
}

/* ── Rate Limiting ── */

/**
 * Check if the agent has exceeded the daily research limit.
 */
async function isRateLimited(agentId: string, maxPerDay = 5): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const count = await prisma.agentResearchEntry.count({
    where: {
      agentId,
      createdAt: { gte: todayStart },
    },
  });

  return count >= maxPerDay;
}

/**
 * Check if this question was already researched (avoid duplicates).
 */
async function isAlreadyResearched(agentId: string, question: string): Promise<boolean> {
  const normalized = question.toLowerCase().trim().slice(0, 200);

  const existing = await prisma.agentResearchEntry.findFirst({
    where: {
      agentId,
      question: { contains: normalized.slice(0, 50) },
    },
  });

  return !!existing;
}

/* ── Web Research ── */

/**
 * Generate search queries from a topic using a simple heuristic approach.
 * Falls back to the topic itself if the LLM call fails.
 */
function generateSearchQueries(topic: string): string[] {
  // Generate 3 variations of the search query
  const base = topic.replace(/[?!.]+$/, "").trim();
  return [
    base,
    `${base} explained`,
    `what is ${base}`,
  ].slice(0, 3);
}

/**
 * Performs web research using Perplexity API (if available) or web fetch.
 * Returns a summarized answer with source URLs.
 */
async function performWebResearch(
  topic: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  queries: string[]
): Promise<{ answer: string; sources: string[] } | null> {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;

  if (perplexityKey) {
    return performPerplexityResearch(topic, perplexityKey);
  }

  // Fallback: use Claude Haiku to synthesize from the topic directly
  return performLlmResearch(topic);
}

/**
 * Research using Perplexity API (optimized for web search + synthesis).
 */
async function performPerplexityResearch(
  topic: string,
  apiKey: string
): Promise<{ answer: string; sources: string[] } | null> {
  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "You are a research assistant. Provide a concise, factual answer to the question. Include specific details that would be useful for a customer service agent's knowledge base. Keep your answer under 300 words.",
          },
          {
            role: "user",
            content: `Research and answer this question concisely: ${topic}`,
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.error("[AgenticRAG] Perplexity API error:", response.status);
      return performLlmResearch(topic);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "";
    // Perplexity returns citations in the response
    const citations: string[] = data.citations || [];

    if (!answer) return null;

    return {
      answer: answer.slice(0, 2000),
      sources: citations.slice(0, 5),
    };
  } catch (err) {
    console.error("[AgenticRAG] Perplexity research failed:", err);
    return performLlmResearch(topic);
  }
}

/**
 * Fallback: Use Claude Haiku to generate a researched answer.
 */
async function performLlmResearch(
  topic: string
): Promise<{ answer: string; sources: string[] } | null> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `You are a research assistant helping build a customer service knowledge base. Provide a concise, factual answer to this question that an AI agent can use to respond to customers in the future.

Question: ${topic}

Respond with ONLY the answer (no preamble, no "Here's the answer:" etc). Keep it under 250 words, factual, and helpful.`,
          },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const answer = data.content?.[0]?.text || "";
    if (!answer) return null;

    return {
      answer: answer.slice(0, 2000),
      sources: [], // No URLs from direct LLM
    };
  } catch (err) {
    console.error("[AgenticRAG] LLM research failed:", err);
    return null;
  }
}

/* ── Main Pipeline ── */

/**
 * Research a knowledge gap and store the result as a DRAFT entry.
 * Call this inside waitUntil() — never blocks the chat response.
 */
export async function researchAndLearn(
  agentId: string,
  gap: KnowledgeGapResult
): Promise<void> {
  try {
    // Rate limit check
    if (await isRateLimited(agentId)) {
      console.log(`[AgenticRAG] Agent ${agentId} hit daily research limit`);
      return;
    }

    // Duplicate check
    if (await isAlreadyResearched(agentId, gap.originalQuestion)) {
      console.log(`[AgenticRAG] Already researched: ${gap.topic.slice(0, 50)}`);
      return;
    }

    // Generate search queries
    const queries = generateSearchQueries(gap.topic);

    // Perform research
    const result = await performWebResearch(gap.topic, queries);
    if (!result || !result.answer) {
      console.log(`[AgenticRAG] No results for: ${gap.topic.slice(0, 50)}`);
      return;
    }

    // Store as DRAFT
    await prisma.agentResearchEntry.create({
      data: {
        agentId,
        question: gap.originalQuestion,
        answer: result.answer,
        sources: result.sources,
        status: "DRAFT",
      },
    });

    console.log(`[AgenticRAG] Research entry created for agent ${agentId}: ${gap.topic.slice(0, 50)}`);
  } catch (err) {
    console.error("[AgenticRAG] researchAndLearn failed:", err);
  }
}

/**
 * Approve a research entry — adds it to the agent's KB as an FAQ entry with embeddings.
 */
export async function approveResearchEntry(
  entryId: string,
  reviewedBy: string,
  editedAnswer?: string
): Promise<{ success: boolean; error?: string }> {
  const entry = await prisma.agentResearchEntry.findUnique({
    where: { id: entryId },
  });

  if (!entry || entry.status !== "DRAFT") {
    return { success: false, error: "Entry not found or already reviewed" };
  }

  const finalAnswer = editedAnswer || entry.answer;

  // Create the FAQ content
  const faqContent = `Frage: ${entry.question}\nAntwort: ${finalAnswer}`;

  // Create KB entry
  const kb = await prisma.knowledgeBase.create({
    data: {
      agentId: entry.agentId,
      type: "FAQ",
      sourceName: `Research: ${entry.question.slice(0, 50)}`,
      content: faqContent,
      embeddingStatus: "PROCESSING",
    },
  });

  // Generate embeddings in the background
  try {
    const { chunkText, generateEmbeddings, storeChunks } = await import("@/lib/rag");
    const chunks = chunkText(faqContent);
    const embeddings = await generateEmbeddings(chunks);
    await storeChunks(kb.id, entry.agentId, chunks, embeddings);

    await prisma.knowledgeBase.update({
      where: { id: kb.id },
      data: { chunkCount: chunks.length, embeddingStatus: "READY" },
    });
  } catch (err) {
    console.error("[AgenticRAG] Embedding failed:", err);
    await prisma.knowledgeBase.update({
      where: { id: kb.id },
      data: { embeddingStatus: "ERROR" },
    });
  }

  // Mark as approved
  await prisma.agentResearchEntry.update({
    where: { id: entryId },
    data: {
      status: "APPROVED",
      answer: finalAnswer,
      reviewedAt: new Date(),
      reviewedBy,
    },
  });

  return { success: true };
}

/**
 * Reject a research entry.
 */
export async function rejectResearchEntry(
  entryId: string,
  reviewedBy: string
): Promise<{ success: boolean; error?: string }> {
  const entry = await prisma.agentResearchEntry.findUnique({
    where: { id: entryId },
  });

  if (!entry || entry.status !== "DRAFT") {
    return { success: false, error: "Entry not found or already reviewed" };
  }

  await prisma.agentResearchEntry.update({
    where: { id: entryId },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedBy,
    },
  });

  return { success: true };
}
