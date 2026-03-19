/**
 * Agentic RAG V1.0 — Self-Learning Knowledge Base
 * Multi-source verification, source quality scoring, auto-approve, KB conflict detection.
 */

import { prisma } from "@/lib/prisma";

/* ── Types ── */

export interface KnowledgeGapResult {
  isGap: boolean;
  topic: string;
  originalQuestion: string;
}

export interface SourceDetail {
  url: string;
  title: string;
  snippet: string;
  trustScore: number;
}

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

  const topic = extractTopic(userMessage);
  return { isGap: true, topic, originalQuestion: userMessage.slice(0, 500) };
}

function extractTopic(message: string): string {
  const cleaned = message
    .replace(/^(hey|hi|hello|hallo|can you|could you|please|bitte|kannst du|könntest du)\s*/i, "")
    .replace(/[?!.]+$/, "")
    .trim();
  return cleaned.slice(0, 200);
}

/* ── Source Quality Scoring ── */

const HIGH_TRUST_PATTERNS = [
  ".gov", ".edu", "docs.", "support.", "help.", "developer.",
  "documentation.", "api.", "reference.",
];

const ESTABLISHED_DOMAINS = [
  "wikipedia.org", "github.com", "stackoverflow.com",
  "reuters.com", "bbc.com", "nytimes.com", "theguardian.com",
  "mdn.mozilla.org", "w3.org", "ietf.org",
  "microsoft.com", "google.com", "apple.com", "amazon.com",
  "docs.python.org", "nodejs.org", "rust-lang.org",
  "medium.com", "dev.to", "hackernews.com",
];

const COMMUNITY_DOMAINS = [
  "reddit.com", "quora.com", "stackexchange.com",
  "discourse.org", "forum.", "community.",
  "discuss.", "answers.",
];

const UNRELIABLE_PATTERNS = [
  "buzzfeed.com", "clickbait", "spam",
];

/**
 * Score a source URL by domain trustworthiness (deterministic, no AI).
 */
export function scoreSource(url: string): number {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const fullUrl = url.toLowerCase();

    // Unreliable
    if (UNRELIABLE_PATTERNS.some((p) => hostname.includes(p) || fullUrl.includes(p))) {
      return 10;
    }

    // Official / documentation
    if (HIGH_TRUST_PATTERNS.some((p) => hostname.includes(p) || fullUrl.includes(p))) {
      return 90;
    }

    // Established sites
    if (ESTABLISHED_DOMAINS.some((d) => hostname.includes(d))) {
      return 70;
    }

    // Community content
    if (COMMUNITY_DOMAINS.some((d) => hostname.includes(d))) {
      return 50;
    }

    // Unknown
    return 30;
  } catch {
    return 20;
  }
}

/* ── Rate Limiting ── */

async function isRateLimited(agentId: string, maxPerDay = 5): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const count = await prisma.agentResearchEntry.count({
    where: { agentId, createdAt: { gte: todayStart } },
  });

  return count >= maxPerDay;
}

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

/* ── Multi-Query Generation ── */

function generateSearchQueries(topic: string): string[] {
  const base = topic.replace(/[?!.]+$/, "").trim();
  return [
    base,
    `${base} explained`,
    `what is ${base}`,
  ];
}

/* ── Web Research (Multi-Source) ── */

interface ResearchResult {
  answer: string;
  sources: string[];
  sourcesDetailed: SourceDetail[];
  confidenceScore: number;
}

async function performMultiSourceResearch(
  topic: string,
  queries: string[]
): Promise<ResearchResult | null> {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // Collect results from multiple queries
  const allSources: SourceDetail[] = [];
  const allAnswers: string[] = [];

  if (perplexityKey) {
    // Run all 3 queries against Perplexity
    const results = await Promise.allSettled(
      queries.map((q) => performPerplexityQuery(q, perplexityKey))
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        allAnswers.push(result.value.answer);
        for (const src of result.value.sources) {
          const trust = scoreSource(src.url);
          allSources.push({ ...src, trustScore: trust });
        }
      }
    }
  }

  // Fallback: single LLM research if no Perplexity results
  if (allAnswers.length === 0) {
    const llmResult = await performLlmResearch(topic);
    if (!llmResult) return null;

    return {
      answer: llmResult.answer,
      sources: [],
      sourcesDetailed: [],
      confidenceScore: 50, // Lower confidence without multi-source
    };
  }

  // Deduplicate sources by URL
  const uniqueSources = deduplicateSources(allSources);

  // Consolidate answers via Claude Haiku
  if (allAnswers.length >= 2 && anthropicKey) {
    const consolidated = await consolidateAnswers(topic, allAnswers, uniqueSources, anthropicKey);
    if (consolidated) return consolidated;
  }

  // Fallback: use the first answer
  return {
    answer: allAnswers[0],
    sources: uniqueSources.map((s) => s.url),
    sourcesDetailed: uniqueSources,
    confidenceScore: allAnswers.length === 1 ? 60 : 75,
  };
}

async function performPerplexityQuery(
  query: string,
  apiKey: string
): Promise<{ answer: string; sources: SourceDetail[] } | null> {
  try {
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
            content: "You are a research assistant. Provide a concise, factual answer. Include specific details useful for a customer service knowledge base. Keep under 300 words.",
          },
          {
            role: "user",
            content: `Research: ${query}`,
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "";
    const citations: string[] = data.citations || [];

    if (!answer) return null;

    const sources: SourceDetail[] = citations.slice(0, 5).map((url: string) => ({
      url,
      title: extractDomainName(url),
      snippet: "",
      trustScore: scoreSource(url),
    }));

    return { answer: answer.slice(0, 2000), sources };
  } catch {
    return null;
  }
}

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

    return { answer: answer.slice(0, 2000), sources: [] };
  } catch {
    return null;
  }
}

/* ── Consolidation via Claude ── */

async function consolidateAnswers(
  topic: string,
  answers: string[],
  sources: SourceDetail[],
  apiKey: string
): Promise<ResearchResult | null> {
  // Weight sources by trust score in the prompt
  const sourceContext = sources
    .sort((a, b) => b.trustScore - a.trustScore)
    .map((s) => `[Trust: ${s.trustScore}] ${s.url}: ${s.snippet || s.title}`)
    .join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: `You are consolidating research from multiple sources to create a single authoritative answer.

Topic: ${topic}

Source answers:
${answers.map((a, i) => `--- Source ${i + 1} ---\n${a}`).join("\n\n")}

Sources with trust scores:
${sourceContext || "(no URLs available)"}

Instructions:
1. Determine the consensus answer from all sources. Prioritize higher-trust sources.
2. If sources agree, provide a consolidated answer.
3. If sources disagree on key points, note the disagreement.

Respond as JSON ONLY:
{
  "answer": "The consolidated answer (max 300 words)",
  "confidence": 0-100,
  "sources_agree": true/false,
  "disagreement_note": "Where sources disagree (or empty string)"
}`,
          },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      answer?: string;
      confidence?: number;
      sources_agree?: boolean;
      disagreement_note?: string;
    };

    const finalAnswer = parsed.disagreement_note
      ? `${parsed.answer}\n\n⚠️ Hinweis: ${parsed.disagreement_note}`
      : parsed.answer || answers[0];

    return {
      answer: finalAnswer.slice(0, 2000),
      sources: sources.map((s) => s.url),
      sourcesDetailed: sources,
      confidenceScore: Math.min(100, Math.max(0, parsed.confidence || 50)),
    };
  } catch {
    return null;
  }
}

/* ── KB Conflict Detection ── */

async function checkKbConflict(
  agentId: string,
  question: string
): Promise<{ hasConflict: boolean; conflictingKbId?: string; existingContent?: string }> {
  try {
    const { searchRelevantChunks } = await import("@/lib/rag");
    const results = await searchRelevantChunks(agentId, question, 1);

    if (results.length > 0 && results[0].similarity > 0.85) {
      // Finde die zugehörige KB-Entry via content match
      const kbEntry = await prisma.knowledgeBase.findFirst({
        where: {
          agentId,
          content: { contains: results[0].content.slice(0, 50) },
        },
        select: { id: true, content: true },
      });

      if (kbEntry) {
        return {
          hasConflict: true,
          conflictingKbId: kbEntry.id,
          existingContent: kbEntry.content?.slice(0, 500) || results[0].content,
        };
      }
    }
  } catch (err) {
    console.error("[AgenticRAG] Conflict check failed:", err);
  }

  return { hasConflict: false };
}

/* ── Helpers ── */

function deduplicateSources(sources: SourceDetail[]): SourceDetail[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

function extractDomainName(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

/* ── Main Pipeline ── */

/**
 * Research a knowledge gap with multi-source verification, auto-approve, and conflict detection.
 */
export async function researchAndLearn(
  agentId: string,
  gap: KnowledgeGapResult
): Promise<void> {
  try {
    if (await isRateLimited(agentId)) {
      console.log(`[AgenticRAG] Agent ${agentId} hit daily research limit`);
      return;
    }

    if (await isAlreadyResearched(agentId, gap.originalQuestion)) {
      console.log(`[AgenticRAG] Already researched: ${gap.topic.slice(0, 50)}`);
      return;
    }

    const queries = generateSearchQueries(gap.topic);
    const result = await performMultiSourceResearch(gap.topic, queries);
    if (!result || !result.answer) {
      console.log(`[AgenticRAG] No results for: ${gap.topic.slice(0, 50)}`);
      return;
    }

    // Agent-Einstellungen laden
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        agenticRagAutoApprove: true,
        agenticRagMinConfidence: true,
      },
    });

    // KB Conflict Detection
    const conflict = await checkKbConflict(agentId, gap.originalQuestion);

    let status: "DRAFT" | "CONFLICT" | "APPROVED" = "DRAFT";

    if (conflict.hasConflict) {
      status = "CONFLICT";
    } else if (
      agent?.agenticRagAutoApprove &&
      result.confidenceScore >= (agent.agenticRagMinConfidence || 90)
    ) {
      status = "APPROVED";
    }

    // Entry speichern
    const entry = await prisma.agentResearchEntry.create({
      data: {
        agentId,
        question: gap.originalQuestion,
        answer: result.answer,
        sources: result.sources,
        sourcesDetailed: JSON.parse(JSON.stringify(result.sourcesDetailed)),
        confidenceScore: result.confidenceScore,
        conflictsWith: conflict.conflictingKbId || null,
        status,
        ...(status === "APPROVED"
          ? { reviewedAt: new Date(), reviewedBy: "auto-approve" }
          : {}),
      },
    });

    // Auto-approve: sofort in KB übernehmen
    if (status === "APPROVED") {
      await addResearchToKb(entry.id, agentId, gap.originalQuestion, result.answer);
      console.log(
        `[AgenticRAG] Auto-approved: ${gap.topic.slice(0, 50)} (confidence: ${result.confidenceScore}%)`
      );
    } else if (status === "CONFLICT") {
      console.log(
        `[AgenticRAG] Conflict detected for: ${gap.topic.slice(0, 50)} (KB entry: ${conflict.conflictingKbId})`
      );
    } else {
      console.log(
        `[AgenticRAG] Research entry created (confidence: ${result.confidenceScore}%): ${gap.topic.slice(0, 50)}`
      );
    }
  } catch (err) {
    console.error("[AgenticRAG] researchAndLearn failed:", err);
  }
}

/* ── KB Integration ── */

async function addResearchToKb(
  entryId: string,
  agentId: string,
  question: string,
  answer: string
): Promise<void> {
  const faqContent = `Frage: ${question}\nAntwort: ${answer}`;

  const kb = await prisma.knowledgeBase.create({
    data: {
      agentId,
      type: "FAQ",
      sourceName: `Research: ${question.slice(0, 50)}`,
      content: faqContent,
      embeddingStatus: "PROCESSING",
    },
  });

  try {
    const { chunkText, generateEmbeddings, storeChunks } = await import("@/lib/rag");
    const chunks = chunkText(faqContent);
    const embeddings = await generateEmbeddings(chunks);
    await storeChunks(kb.id, agentId, chunks, embeddings);

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
}

/**
 * Approve a research entry — adds it to the agent's KB as an FAQ entry.
 */
export async function approveResearchEntry(
  entryId: string,
  reviewedBy: string,
  editedAnswer?: string
): Promise<{ success: boolean; error?: string }> {
  const entry = await prisma.agentResearchEntry.findUnique({
    where: { id: entryId },
  });

  if (!entry || (entry.status !== "DRAFT" && entry.status !== "CONFLICT")) {
    return { success: false, error: "Entry not found or already reviewed" };
  }

  const finalAnswer = editedAnswer || entry.answer;

  await addResearchToKb(entryId, entry.agentId, entry.question, finalAnswer);

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

  if (!entry || (entry.status !== "DRAFT" && entry.status !== "CONFLICT")) {
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

/**
 * Resolve a conflict: keep existing, replace, or keep both.
 */
export async function resolveConflict(
  entryId: string,
  resolution: "keep_existing" | "replace" | "keep_both",
  reviewedBy: string
): Promise<{ success: boolean; error?: string }> {
  const entry = await prisma.agentResearchEntry.findUnique({
    where: { id: entryId },
  });

  if (!entry || entry.status !== "CONFLICT") {
    return { success: false, error: "Entry not found or not a conflict" };
  }

  switch (resolution) {
    case "keep_existing":
      // Reject the new research
      await prisma.agentResearchEntry.update({
        where: { id: entryId },
        data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy },
      });
      break;

    case "replace":
      // Delete old KB entry, approve new
      if (entry.conflictsWith) {
        await prisma.knowledgeBase.delete({
          where: { id: entry.conflictsWith },
        }).catch(() => { /* old entry may already be gone */ });
      }
      await addResearchToKb(entryId, entry.agentId, entry.question, entry.answer);
      await prisma.agentResearchEntry.update({
        where: { id: entryId },
        data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy },
      });
      break;

    case "keep_both":
      // Add new alongside existing
      await addResearchToKb(entryId, entry.agentId, entry.question, entry.answer);
      await prisma.agentResearchEntry.update({
        where: { id: entryId },
        data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy },
      });
      break;
  }

  return { success: true };
}

/**
 * Get weekly self-learning stats for a user's agents.
 */
export async function getWeeklyResearchStats(
  userId: string
): Promise<{
  totalResearched: number;
  autoApproved: number;
  pendingReview: number;
  topTopics: string[];
} | null> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const agents = await prisma.agent.findMany({
    where: { userId, status: "LIVE" },
    select: { id: true },
  });

  if (agents.length === 0) return null;

  const agentIds = agents.map((a) => a.id);

  const entries = await prisma.agentResearchEntry.findMany({
    where: {
      agentId: { in: agentIds },
      createdAt: { gte: sevenDaysAgo },
    },
    select: {
      question: true,
      status: true,
      reviewedBy: true,
    },
  });

  if (entries.length === 0) return null;

  const autoApproved = entries.filter(
    (e) => e.status === "APPROVED" && e.reviewedBy === "auto-approve"
  ).length;

  const pendingReview = entries.filter(
    (e) => e.status === "DRAFT" || e.status === "CONFLICT"
  ).length;

  // Top 3 topics (deduplicated by first 30 chars)
  const topicSet = new Set<string>();
  const topTopics: string[] = [];
  for (const e of entries) {
    const short = e.question.slice(0, 60);
    if (!topicSet.has(short) && topTopics.length < 3) {
      topicSet.add(short);
      topTopics.push(short);
    }
  }

  return {
    totalResearched: entries.length,
    autoApproved,
    pendingReview,
    topTopics,
  };
}
