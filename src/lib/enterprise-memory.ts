/**
 * Enterprise Agent Memory — Cross-Agent Business Intelligence
 * Extrahiert und aggregiert Business-Insights aus allen Agent-Gesprächen.
 */

import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

interface ExtractedInsight {
  topic: string;
  sentiment: "positive" | "negative" | "neutral" | "high_interest";
  relatedTopics: string[];
}

/**
 * Extrahiert Business-Insights aus einer Konversation via LLM.
 */
export async function extractInsights(
  messages: { role: string; content: string }[],
  client: Anthropic,
  model: string
): Promise<ExtractedInsight[]> {
  if (messages.length < 2) return [];

  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 3000); // Max 3000 chars

  try {
    const response = await client.messages.create({
      model: model.startsWith("claude") ? model : "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: `Extract business topics discussed in this conversation. Return JSON array.
Each item: { "topic": "lowercase_topic", "sentiment": "positive|negative|neutral|high_interest", "relatedTopics": ["related1"] }
Rules:
- Topics should be 1-3 words, lowercase, business-relevant (not small talk)
- Only extract meaningful business topics (products, services, objections, interests)
- Max 5 topics per conversation
- sentiment: high_interest = actively asking about buying/pricing/scheduling
Return ONLY the JSON array, no other text.`,
      messages: [{ role: "user", content: conversationText }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedInsight[];
    return parsed.filter(
      (i) => i.topic && typeof i.topic === "string" && i.topic.length > 0
    );
  } catch {
    return [];
  }
}

/**
 * Speichert oder aktualisiert Enterprise Insights in der DB.
 */
export async function recordInsights(
  userId: string,
  agentId: string,
  insights: ExtractedInsight[]
): Promise<void> {
  for (const insight of insights) {
    const topic = insight.topic.toLowerCase().trim().slice(0, 100);
    if (!topic) continue;

    try {
      const existing = await prisma.enterpriseInsight.findUnique({
        where: { userId_topic: { userId, topic } },
      });

      if (existing) {
        // Update: Mentions erhöhen, Trend berechnen
        const newCount = existing.mentionCount + 1;
        const breakdown = (existing.agentBreakdown as Record<string, number>) || {};
        breakdown[agentId] = (breakdown[agentId] || 0) + 1;

        // Trend berechnen: Vergleich letzte Aktualisierung
        const daysSinceLastSeen = Math.max(
          1,
          Math.floor((Date.now() - existing.lastSeenAt.getTime()) / 86400000)
        );
        let trend = existing.trend;
        if (daysSinceLastSeen <= 7) trend = "increasing";
        else if (daysSinceLastSeen > 30) trend = "decreasing";

        // Related Topics mergen
        const existingRelated = (existing.relatedTopics as string[]) || [];
        const mergedRelated = Array.from(
          new Set([...existingRelated, ...(insight.relatedTopics || [])])
        ).slice(0, 10);

        await prisma.enterpriseInsight.update({
          where: { id: existing.id },
          data: {
            mentionCount: newCount,
            sentiment: insight.sentiment,
            trend,
            relatedTopics: mergedRelated,
            agentBreakdown: breakdown,
            lastSeenAt: new Date(),
          },
        });
      } else {
        // Neu anlegen
        await prisma.enterpriseInsight.create({
          data: {
            userId,
            topic,
            sentiment: insight.sentiment,
            mentionCount: 1,
            trend: "stable",
            relatedTopics: insight.relatedTopics || [],
            agentBreakdown: { [agentId]: 1 },
          },
        });
      }
    } catch (err) {
      console.error(`Enterprise insight upsert failed for "${topic}":`, err);
    }
  }
}

/**
 * Lädt relevante Enterprise Insights für System-Prompt Injection.
 */
export async function injectEnterpriseContext(
  userId: string
): Promise<string> {
  try {
    // Top-Insights der letzten 30 Tage laden
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const topInsights = await prisma.enterpriseInsight.findMany({
      where: {
        userId,
        lastSeenAt: { gte: thirtyDaysAgo },
        mentionCount: { gte: 3 },
      },
      orderBy: { mentionCount: "desc" },
      take: 8,
    });

    if (topInsights.length === 0) return "";

    const lines = topInsights.map((i) => {
      const trendEmoji = i.trend === "increasing" ? "↑" : i.trend === "decreasing" ? "↓" : "→";
      return `- ${i.topic}: ${i.mentionCount} mentions (${trendEmoji} ${i.trend}, sentiment: ${i.sentiment})`;
    });

    return `\n\n---\nBUSINESS INTELLIGENCE (from all your agents):\n${lines.join("\n")}\n---\nUse this context to give better, more informed responses. Reference trends naturally.`;
  } catch {
    return "";
  }
}

/**
 * Aggregiert Business Intelligence für das Dashboard.
 */
export async function getBusinessIntelligence(
  userId: string,
  dateRange: { from: Date; to: Date }
) {
  const insights = await prisma.enterpriseInsight.findMany({
    where: {
      userId,
      lastSeenAt: { gte: dateRange.from, lte: dateRange.to },
    },
    orderBy: { mentionCount: "desc" },
  });

  const totalMentions = insights.reduce((sum, i) => sum + i.mentionCount, 0);
  const topTopics = insights.slice(0, 10);
  const increasingTopics = insights.filter((i) => i.trend === "increasing");
  const positiveTopics = insights.filter(
    (i) => i.sentiment === "positive" || i.sentiment === "high_interest"
  );

  // Cross-Agent Patterns: Topics die in mehreren Agents vorkommen
  const crossAgentTopics = insights.filter((i) => {
    const breakdown = (i.agentBreakdown as Record<string, number>) || {};
    return Object.keys(breakdown).length > 1;
  });

  return {
    totalTopics: insights.length,
    totalMentions,
    topTopics: topTopics.map((i) => ({
      topic: i.topic,
      count: i.mentionCount,
      trend: i.trend,
      sentiment: i.sentiment,
      relatedTopics: (i.relatedTopics as string[]) || [],
      agentCount: Object.keys((i.agentBreakdown as Record<string, number>) || {}).length,
    })),
    trendingUp: increasingTopics.map((i) => ({
      topic: i.topic,
      count: i.mentionCount,
    })),
    positiveSentiment: positiveTopics.length,
    crossAgentPatterns: crossAgentTopics.map((i) => ({
      topic: i.topic,
      agents: Object.keys((i.agentBreakdown as Record<string, number>) || {}).length,
      totalMentions: i.mentionCount,
    })),
  };
}
