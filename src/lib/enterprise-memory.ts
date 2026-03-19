/**
 * Enterprise Agent Memory V1.0 — Cross-Agent Business Intelligence
 * Extrahiert und aggregiert Business-Insights aus allen Agent-Gesprächen.
 * Includes: Revenue Attribution, Competitive Intelligence, Predictive Insights.
 */

import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

interface ExtractedInsight {
  topic: string;
  sentiment: "positive" | "negative" | "neutral" | "high_interest";
  relatedTopics: string[];
}

interface ExtractedCompetitor {
  competitorName: string;
  context: string;
  sentiment: "positive" | "negative" | "neutral";
}

interface ExtractionResult {
  insights: ExtractedInsight[];
  competitors: ExtractedCompetitor[];
  hasLeadSignal: boolean;
  hasAppointmentSignal: boolean;
}

/**
 * Extrahiert Business-Insights + Competitor Mentions aus einer Konversation via LLM.
 */
export async function extractInsights(
  messages: { role: string; content: string }[],
  client: Anthropic,
  model: string
): Promise<ExtractionResult> {
  const empty: ExtractionResult = { insights: [], competitors: [], hasLeadSignal: false, hasAppointmentSignal: false };
  if (messages.length < 2) return empty;

  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 3000);

  try {
    const response = await client.messages.create({
      model: model.startsWith("claude") ? model : "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: `Analyze this conversation and return a JSON object with these fields:

1. "insights": array of business topics
   Each: { "topic": "lowercase_topic", "sentiment": "positive|negative|neutral|high_interest", "relatedTopics": ["related1"] }
   Rules: 1-3 words, lowercase, business-relevant only. Max 5 topics.
   sentiment: high_interest = actively asking about buying/pricing/scheduling

2. "competitors": array of competitor mentions (companies, products, services the visitor compares to or mentions)
   Each: { "competitorName": "Name", "context": "brief context of mention", "sentiment": "positive|negative|neutral" }
   Only include actual competitor names, not generic terms.

3. "hasLeadSignal": boolean — true if visitor shared email, asked for pricing, or showed buying intent
4. "hasAppointmentSignal": boolean — true if visitor booked, requested, or discussed an appointment/meeting

Return ONLY the JSON object, no other text.`,
      messages: [{ role: "user", content: conversationText }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return empty;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      insights: (parsed.insights || []).filter(
        (i: ExtractedInsight) => i.topic && typeof i.topic === "string" && i.topic.length > 0
      ),
      competitors: (parsed.competitors || []).filter(
        (c: ExtractedCompetitor) => c.competitorName && c.competitorName.length > 0
      ),
      hasLeadSignal: !!parsed.hasLeadSignal,
      hasAppointmentSignal: !!parsed.hasAppointmentSignal,
    };
  } catch {
    return empty;
  }
}

/**
 * Speichert oder aktualisiert Enterprise Insights in der DB.
 * Jetzt mit Revenue Attribution + Competitive Intelligence.
 */
export async function recordInsights(
  userId: string,
  agentId: string,
  result: ExtractionResult
): Promise<void> {
  const { insights, competitors, hasLeadSignal, hasAppointmentSignal } = result;

  // Business-Topics speichern
  for (const insight of insights) {
    const topic = insight.topic.toLowerCase().trim().slice(0, 100);
    if (!topic) continue;

    try {
      const existing = await prisma.enterpriseInsight.findUnique({
        where: { userId_topic: { userId, topic } },
      });

      if (existing) {
        const newCount = existing.mentionCount + 1;
        const breakdown = (existing.agentBreakdown as Record<string, number>) || {};
        breakdown[agentId] = (breakdown[agentId] || 0) + 1;

        const daysSinceLastSeen = Math.max(
          1,
          Math.floor((Date.now() - existing.lastSeenAt.getTime()) / 86400000)
        );
        let trend = existing.trend;
        if (daysSinceLastSeen <= 7) trend = "increasing";
        else if (daysSinceLastSeen > 30) trend = "decreasing";

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
            // Revenue Attribution
            leadCount: hasLeadSignal ? existing.leadCount + 1 : existing.leadCount,
            appointmentCount: hasAppointmentSignal
              ? existing.appointmentCount + 1
              : existing.appointmentCount,
          },
        });
      } else {
        await prisma.enterpriseInsight.create({
          data: {
            userId,
            topic,
            type: "topic",
            sentiment: insight.sentiment,
            mentionCount: 1,
            trend: "stable",
            relatedTopics: insight.relatedTopics || [],
            agentBreakdown: { [agentId]: 1 },
            leadCount: hasLeadSignal ? 1 : 0,
            appointmentCount: hasAppointmentSignal ? 1 : 0,
          },
        });
      }
    } catch (err) {
      console.error(`Enterprise insight upsert failed for "${topic}":`, err);
    }
  }

  // Competitor Mentions speichern
  for (const comp of competitors) {
    const topic = `competitor:${comp.competitorName.toLowerCase().trim()}`;
    if (topic.length < 13) continue; // "competitor:" + mindestens 2 chars

    try {
      const existing = await prisma.enterpriseInsight.findUnique({
        where: { userId_topic: { userId, topic } },
      });

      if (existing) {
        await prisma.enterpriseInsight.update({
          where: { id: existing.id },
          data: {
            mentionCount: existing.mentionCount + 1,
            sentiment: comp.sentiment,
            competitorContext: comp.context,
            lastSeenAt: new Date(),
          },
        });
      } else {
        await prisma.enterpriseInsight.create({
          data: {
            userId,
            topic,
            type: "competitor",
            sentiment: comp.sentiment,
            mentionCount: 1,
            trend: "stable",
            competitorName: comp.competitorName,
            competitorContext: comp.context,
            agentBreakdown: { [agentId]: 1 },
          },
        });
      }
    } catch (err) {
      console.error(`Competitor insight upsert failed for "${comp.competitorName}":`, err);
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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const topInsights = await prisma.enterpriseInsight.findMany({
      where: {
        userId,
        type: "topic",
        lastSeenAt: { gte: thirtyDaysAgo },
        mentionCount: { gte: 3 },
      },
      orderBy: { mentionCount: "desc" },
      take: 8,
    });

    if (topInsights.length === 0) return "";

    const lines = topInsights.map((i) => {
      const trendEmoji = i.trend === "increasing" ? "↑" : i.trend === "decreasing" ? "↓" : "→";
      const leadInfo = i.leadCount > 0 ? `, ${i.leadCount} leads` : "";
      return `- ${i.topic}: ${i.mentionCount} mentions (${trendEmoji} ${i.trend}, sentiment: ${i.sentiment}${leadInfo})`;
    });

    return `\n\n---\nBUSINESS INTELLIGENCE (from all your agents):\n${lines.join("\n")}\n---\nUse this context to give better, more informed responses. Reference trends naturally.`;
  } catch {
    return "";
  }
}

// Hilfstypen für die Weekly History
interface WeeklyEntry {
  week: string;
  count: number;
}

/**
 * Einfache Trend-Extrapolation basierend auf Weekly History.
 */
function predictNextWeek(history: WeeklyEntry[]): { predicted: number; confidence: number; reasoning: string } | null {
  if (history.length < 3) return null;

  const recent = history.slice(-3);
  const counts = recent.map((h) => h.count);

  // Linearer Trend
  const diffs = [counts[1] - counts[0], counts[2] - counts[1]];
  const avgDiff = (diffs[0] + diffs[1]) / 2;
  const predicted = Math.max(0, Math.round(counts[2] + avgDiff));

  // Konfidenz: stabil = hoch, volatil = niedrig
  const variance = Math.abs(diffs[0] - diffs[1]);
  const avgCount = counts.reduce((s, c) => s + c, 0) / 3;
  const confidence = avgCount > 0 ? Math.max(0.2, Math.min(0.9, 1 - variance / (avgCount + 1))) : 0.3;

  // Begründung
  let reasoning: string;
  if (avgDiff > 0) {
    reasoning = `Steigender Trend: ${counts.join(" → ")} über 3 Wochen`;
  } else if (avgDiff < 0) {
    reasoning = `Fallender Trend: ${counts.join(" → ")} über 3 Wochen`;
  } else {
    reasoning = `Stabiler Trend: ~${Math.round(avgCount)} Mentions/Woche`;
  }

  return { predicted, confidence, reasoning };
}

/**
 * Generiert AI-basierte Empfehlungen aus den Daten.
 */
function generateRecommendations(
  topTopics: { topic: string; count: number; leadCount: number; conversionRate: number; trend: string }[],
  competitors: { name: string; mentions: number }[],
): string[] {
  const recs: string[] = [];

  // Top-Converter identifizieren
  const topConverter = topTopics.reduce(
    (best, t) => (t.conversionRate > (best?.conversionRate || 0) && t.leadCount > 0 ? t : best),
    null as typeof topTopics[0] | null
  );
  if (topConverter && topConverter.conversionRate > 0.15) {
    recs.push(
      `"${topConverter.topic}" hat eine Conversion Rate von ${(topConverter.conversionRate * 100).toFixed(0)}%. Erstelle dedizierte Landing Pages oder KB-Einträge für dieses Thema.`
    );
  }

  // Steigende Topics ohne Leads
  const risingNoLeads = topTopics.filter((t) => t.trend === "increasing" && t.leadCount === 0 && t.count >= 5);
  if (risingNoLeads.length > 0) {
    recs.push(
      `${risingNoLeads.map((t) => `"${t.topic}"`).join(", ")} ${risingNoLeads.length === 1 ? "steigt" : "steigen"}, aber ohne Lead-Konversion. Prüfe, ob der Agent aktiver nach Kontaktdaten fragt.`
    );
  }

  // Competitor-Awareness
  if (competitors.length > 0) {
    const topComp = competitors[0];
    recs.push(
      `"${topComp.name}" wird ${topComp.mentions}x erwähnt. Erstelle Vergleichs-Content oder schärfe die Differenzierung im Agent-Prompt.`
    );
  }

  // Niedrige Gesamtkonversion
  const totalLeads = topTopics.reduce((s, t) => s + t.leadCount, 0);
  const totalMentions = topTopics.reduce((s, t) => s + t.count, 0);
  if (totalMentions > 20 && totalLeads / totalMentions < 0.05) {
    recs.push(
      `Gesamtkonversion liegt unter 5%. Aktiviere Lead-Scoring und COLLECT_EMAIL Actions in deinen Agents.`
    );
  }

  return recs.slice(0, 5);
}

/**
 * Aggregiert Business Intelligence V1.0 für Dashboard + PDF Reports.
 */
export async function getBusinessIntelligence(
  userId: string,
  dateRange: { from: Date; to: Date }
) {
  const allInsights = await prisma.enterpriseInsight.findMany({
    where: {
      userId,
      lastSeenAt: { gte: dateRange.from, lte: dateRange.to },
    },
    orderBy: { mentionCount: "desc" },
  });

  // Separate topics und competitors
  const topicInsights = allInsights.filter((i) => i.type !== "competitor");
  const competitorInsights = allInsights.filter((i) => i.type === "competitor");

  const totalMentions = topicInsights.reduce((sum, i) => sum + i.mentionCount, 0);
  const totalLeads = topicInsights.reduce((sum, i) => sum + i.leadCount, 0);
  const totalAppointments = topicInsights.reduce((sum, i) => sum + i.appointmentCount, 0);

  const topTopics = topicInsights.slice(0, 15).map((i) => ({
    topic: i.topic,
    count: i.mentionCount,
    trend: i.trend,
    sentiment: i.sentiment,
    relatedTopics: (i.relatedTopics as string[]) || [],
    agentCount: Object.keys((i.agentBreakdown as Record<string, number>) || {}).length,
    leadCount: i.leadCount,
    appointmentCount: i.appointmentCount,
    conversionRate: i.mentionCount > 0 ? i.leadCount / i.mentionCount : 0,
  }));

  const increasingTopics = topicInsights.filter((i) => i.trend === "increasing");
  const positiveTopics = topicInsights.filter(
    (i) => i.sentiment === "positive" || i.sentiment === "high_interest"
  );

  const crossAgentTopics = topicInsights.filter((i) => {
    const breakdown = (i.agentBreakdown as Record<string, number>) || {};
    return Object.keys(breakdown).length > 1;
  });

  // Competitor Intelligence
  const competitors = competitorInsights.map((c) => ({
    name: c.competitorName || c.topic.replace("competitor:", ""),
    mentions: c.mentionCount,
    sentiment: c.sentiment,
    context: c.competitorContext || "",
  }));

  // Predictive Insights
  const predictions = topicInsights
    .map((i) => {
      const history = (i.weeklyHistory as WeeklyEntry[] | null) || [];
      const prediction = predictNextWeek(history);
      if (!prediction) return null;
      const currentWeek = history.length > 0 ? history[history.length - 1].count : i.mentionCount;
      return {
        topic: i.topic,
        currentWeek,
        predictedNextWeek: prediction.predicted,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && Math.abs(p.predictedNextWeek - p.currentWeek) > 1)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);

  // AI Recommendations
  const recommendations = generateRecommendations(topTopics, competitors);

  // Revenue-Topics: nach Lead-Generierung sortiert
  const revenueTopics = [...topTopics]
    .filter((t) => t.leadCount > 0)
    .sort((a, b) => b.leadCount - a.leadCount);

  // Durchschnittliche Conversion-Rate
  const avgConversionRate =
    totalMentions > 0 ? totalLeads / totalMentions : 0;

  return {
    totalTopics: topicInsights.length,
    totalMentions,
    totalLeads,
    totalAppointments,
    topTopics,
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
    // V1.0 Additions
    competitors,
    predictions,
    recommendations,
    revenueTopics,
    avgConversionRate,
  };
}
