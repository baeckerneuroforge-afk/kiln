import { prisma } from "@/lib/prisma";
import { getClaudeClient } from "@/lib/ai";

// ── Types ──────────────────────────────────────────────────────────

export interface QuestionCluster {
  theme: string;
  percentage: number;
  count: number;
  qualityScore: number; // 0-100
  examples: string[];
}

export interface FunnelStage {
  label: string;
  count: number;
  percentage: number;
}

export interface QualityMetrics {
  avgConversationLength: number;
  avgResponseTimeSec: number | null;
  positiveEndingRate: number;
  negativeEndingRate: number;
  neutralEndingRate: number;
  commonExitTopics: string[];
  avgResponseWords: number;
}

export interface LeadIntelligence {
  commonInterests: { interest: string; count: number }[];
  qualityDistribution: { hot: number; warm: number; cold: number };
  bestConversionHours: { hour: number; conversions: number }[];
  totalLeads: number;
}

export interface ImprovementSuggestion {
  id: string;
  type: "knowledge" | "prompt" | "engagement" | "conversion";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  metric?: string;
}

export interface TrendComparison {
  metric: string;
  current: number;
  previous: number;
  changePercent: number;
  direction: "up" | "down" | "flat";
}

export interface DeepDiveResult {
  topQuestions: QuestionCluster[];
  conversionFunnel: FunnelStage[];
  quality: QualityMetrics;
  leadIntelligence: LeadIntelligence;
  suggestions: ImprovementSuggestion[];
  trends: TrendComparison[];
  dateRange: { from: string; to: string };
  conversationCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────

const POSITIVE_SIGNALS = [
  "thank you", "thanks", "perfect", "great", "awesome", "helpful",
  "danke", "super", "toll", "perfekt", "genau", "klasse",
  "that helps", "exactly what i needed", "appreciate",
];

const NEGATIVE_SIGNALS = [
  "not helpful", "doesn't help", "wrong", "incorrect", "useless",
  "hilft nicht", "falsch", "stimmt nicht", "unnütz",
  "i give up", "never mind", "forget it",
];

const FALLBACK_PHRASES = [
  "i don't know", "i am not sure", "i'm not sure",
  "i can't help with that", "i cannot help with that",
  "i don't have that information",
  "ich weiss es nicht", "ich weiß es nicht",
  "ich bin mir nicht sicher", "dabei kann ich nicht helfen",
];

function classifySentiment(messages: { role: string; content: string }[]): "positive" | "negative" | "neutral" {
  // Look at the last 2-3 user messages for sentiment signals
  const lastUserMessages = messages
    .filter((m) => m.role === "USER")
    .slice(-3)
    .map((m) => m.content.toLowerCase());

  const combined = lastUserMessages.join(" ");

  if (POSITIVE_SIGNALS.some((s) => combined.includes(s))) return "positive";
  if (NEGATIVE_SIGNALS.some((s) => combined.includes(s))) return "negative";
  return "neutral";
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ── Core Analysis ──────────────────────────────────────────────────

export async function analyzeConversations(
  agentId: string,
  days: number = 30
): Promise<DeepDiveResult> {
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - days);
  periodStart.setHours(0, 0, 0, 0);

  // Previous period for trend comparison
  const prevPeriodStart = new Date(periodStart);
  prevPeriodStart.setDate(prevPeriodStart.getDate() - days);

  // Load conversations with messages
  const conversations = await prisma.conversation.findMany({
    where: {
      agentId,
      createdAt: { gte: periodStart },
    },
    select: {
      id: true,
      createdAt: true,
      actionsUsed: true,
      visitorEmail: true,
      leadScore: true,
      channel: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Previous period conversations for trends
  const prevConversations = await prisma.conversation.findMany({
    where: {
      agentId,
      createdAt: { gte: prevPeriodStart, lt: periodStart },
    },
    select: {
      id: true,
      actionsUsed: true,
      visitorEmail: true,
      messages: {
        select: { role: true },
      },
    },
  });

  // Leads
  const leads = await prisma.lead.findMany({
    where: {
      agentId,
      createdAt: { gte: periodStart },
    },
    select: { email: true, context: true, score: true, createdAt: true },
  });

  // ── 1. Top Questions (LLM clustering) ────────────────────────

  const openingQuestions: string[] = [];
  const questionResponsePairs: { question: string; response: string }[] = [];

  for (const conv of conversations) {
    const userMsgs = conv.messages.filter((m) => m.role === "USER");
    const assistantMsgs = conv.messages.filter((m) => m.role === "ASSISTANT");

    if (userMsgs.length > 0) {
      const q = userMsgs[0].content.slice(0, 200);
      openingQuestions.push(q);

      // Pair with first assistant response for quality scoring
      if (assistantMsgs.length > 0) {
        const response = assistantMsgs[0].content.toLowerCase();
        questionResponsePairs.push({ question: q, response });
      }
    }
  }

  let topQuestions: QuestionCluster[] = [];

  if (openingQuestions.length >= 5) {
    topQuestions = await clusterQuestions(openingQuestions, questionResponsePairs);
  }

  // ── 2. Conversion Funnel ─────────────────────────────────────

  const totalVisitors = conversations.length;
  const engaged = conversations.filter(
    (c) => c.messages.filter((m) => m.role === "USER").length >= 3
  ).length;
  const providedEmail = conversations.filter(
    (c) => c.visitorEmail || c.actionsUsed.includes("COLLECT_EMAIL")
  ).length;
  const bookedAppointment = conversations.filter(
    (c) => c.actionsUsed.includes("BOOK_APPOINTMENT")
  ).length;

  const conversionFunnel: FunnelStage[] = [
    { label: "Started Chat", count: totalVisitors, percentage: 100 },
    {
      label: "Engaged (3+ messages)",
      count: engaged,
      percentage: totalVisitors > 0 ? Math.round((engaged / totalVisitors) * 100) : 0,
    },
    {
      label: "Provided Email",
      count: providedEmail,
      percentage: totalVisitors > 0 ? Math.round((providedEmail / totalVisitors) * 100) : 0,
    },
    {
      label: "Booked Appointment",
      count: bookedAppointment,
      percentage: totalVisitors > 0 ? Math.round((bookedAppointment / totalVisitors) * 100) : 0,
    },
  ];

  // ── 3. Quality Metrics ───────────────────────────────────────

  let totalMsgCount = 0;
  let totalResponseWords = 0;
  let responseWordCount = 0;
  const responseTimesMs: number[] = [];
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  const exitTopicCounts = new Map<string, number>();

  for (const conv of conversations) {
    totalMsgCount += conv.messages.length;

    // Response times
    let pendingUserTs: Date | null = null;
    for (const msg of conv.messages) {
      if (msg.role === "USER") {
        pendingUserTs = msg.createdAt;
      } else if (msg.role === "ASSISTANT" && pendingUserTs) {
        responseTimesMs.push(msg.createdAt.getTime() - pendingUserTs.getTime());
        pendingUserTs = null;

        // Count response words
        totalResponseWords += countWords(msg.content);
        responseWordCount++;
      }
    }

    // Sentiment at conversation end
    const sentiment = classifySentiment(
      conv.messages.map((m) => ({ role: m.role, content: m.content }))
    );
    if (sentiment === "positive") positiveCount++;
    else if (sentiment === "negative") negativeCount++;
    else neutralCount++;

    // Exit topic: last user message before conversation ended
    const userMsgs = conv.messages.filter((m) => m.role === "USER");
    if (userMsgs.length > 0) {
      const lastUserMsg = userMsgs[userMsgs.length - 1].content
        .toLowerCase()
        .slice(0, 80)
        .replace(/[^a-z0-9\s]/g, " ")
        .trim();
      if (lastUserMsg.length > 5) {
        const existing = exitTopicCounts.get(lastUserMsg) || 0;
        exitTopicCounts.set(lastUserMsg, existing + 1);
      }
    }
  }

  const avgConversationLength = conversations.length > 0
    ? Number((totalMsgCount / conversations.length).toFixed(1))
    : 0;

  const avgResponseTimeSec = responseTimesMs.length > 0
    ? Number((responseTimesMs.reduce((s, v) => s + v, 0) / responseTimesMs.length / 1000).toFixed(1))
    : null;

  const avgResponseWords = responseWordCount > 0
    ? Math.round(totalResponseWords / responseWordCount)
    : 0;

  const total = positiveCount + negativeCount + neutralCount || 1;
  const positiveEndingRate = Math.round((positiveCount / total) * 100);
  const negativeEndingRate = Math.round((negativeCount / total) * 100);
  const neutralEndingRate = Math.round((neutralCount / total) * 100);

  const commonExitTopics = Array.from(exitTopicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic.slice(0, 60));

  const quality: QualityMetrics = {
    avgConversationLength,
    avgResponseTimeSec,
    positiveEndingRate,
    negativeEndingRate,
    neutralEndingRate,
    commonExitTopics,
    avgResponseWords,
  };

  // ── 4. Lead Intelligence ─────────────────────────────────────

  const interestCounts = new Map<string, number>();
  for (const lead of leads) {
    if (lead.context) {
      const ctx = lead.context.toLowerCase();
      // Extract key interests from lead context
      const words = ctx.split(/\s+/).filter((w) => w.length > 4);
      for (const word of words.slice(0, 5)) {
        interestCounts.set(word, (interestCounts.get(word) || 0) + 1);
      }
    }
  }

  const commonInterests = Array.from(interestCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([interest, count]) => ({ interest, count }));

  // Quality distribution based on engagement
  let hot = 0, warm = 0, cold = 0;
  for (const conv of conversations) {
    if (!conv.visitorEmail && !conv.actionsUsed.includes("COLLECT_EMAIL")) continue;
    const userMsgCount = conv.messages.filter((m) => m.role === "USER").length;
    if (userMsgCount >= 5 || conv.actionsUsed.includes("BOOK_APPOINTMENT")) hot++;
    else if (userMsgCount >= 3) warm++;
    else cold++;
  }

  // Best conversion hours
  const hourConversions = new Map<number, number>();
  for (const conv of conversations) {
    if (conv.visitorEmail || conv.actionsUsed.includes("COLLECT_EMAIL")) {
      const hour = conv.createdAt.getHours();
      hourConversions.set(hour, (hourConversions.get(hour) || 0) + 1);
    }
  }

  const bestConversionHours = Array.from(hourConversions.entries())
    .map(([hour, conversions]) => ({ hour, conversions }))
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 6);

  const leadIntelligence: LeadIntelligence = {
    commonInterests,
    qualityDistribution: { hot, warm, cold },
    bestConversionHours,
    totalLeads: leads.length,
  };

  // ── 5. Improvement Suggestions ───────────────────────────────

  const suggestions: ImprovementSuggestion[] = [];

  // Check fallback rate
  let fallbackCount = 0;
  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role === "ASSISTANT") {
        const lower = msg.content.toLowerCase();
        if (FALLBACK_PHRASES.some((p) => lower.includes(p))) {
          fallbackCount++;
          break;
        }
      }
    }
  }

  if (fallbackCount > 0 && conversations.length > 0) {
    const fallbackRate = Math.round((fallbackCount / conversations.length) * 100);
    if (fallbackRate > 10) {
      suggestions.push({
        id: "high-fallback",
        type: "knowledge",
        priority: "high",
        title: "Agent struggles with some questions",
        description: `${fallbackRate}% of conversations contain fallback answers. Add FAQs for common questions to your knowledge base.`,
        metric: `${fallbackRate}% fallback rate`,
      });
    }
  }

  // Response length check
  if (avgResponseWords > 150) {
    suggestions.push({
      id: "long-responses",
      type: "prompt",
      priority: "medium",
      title: "Responses may be too long",
      description: `Your agent averages ${avgResponseWords} words per response. Try shortening to under 100 words for better engagement.`,
      metric: `${avgResponseWords} words/response`,
    });
  }

  // Bounce rate check
  const bounceCount = conversations.filter(
    (c) => c.messages.filter((m) => m.role === "USER").length <= 1
  ).length;
  const bounceRate = conversations.length > 0 ? Math.round((bounceCount / conversations.length) * 100) : 0;

  if (bounceRate > 40) {
    suggestions.push({
      id: "high-bounce",
      type: "engagement",
      priority: "high",
      title: "High bounce rate",
      description: `${bounceRate}% of visitors leave after one message. Improve your welcome message or add suggested questions.`,
      metric: `${bounceRate}% bounce rate`,
    });
  }

  // Conversion opportunity
  if (engaged > providedEmail * 2 && engaged > 5) {
    suggestions.push({
      id: "conversion-gap",
      type: "conversion",
      priority: "high",
      title: "Conversion opportunity",
      description: `${engaged} visitors engage deeply but only ${providedEmail} provide their email. Enable the Collect Email action or adjust its trigger.`,
      metric: `${Math.round((providedEmail / engaged) * 100)}% email capture rate`,
    });
  }

  // Low engagement check
  if (avgConversationLength < 3 && conversations.length >= 10) {
    suggestions.push({
      id: "low-engagement",
      type: "prompt",
      priority: "medium",
      title: "Low conversation depth",
      description: `Average conversation is only ${avgConversationLength} messages. Add follow-up questions or proactive prompts.`,
      metric: `${avgConversationLength} msgs/conv`,
    });
  }

  // Negative sentiment check
  if (negativeEndingRate > 20 && conversations.length >= 10) {
    suggestions.push({
      id: "negative-sentiment",
      type: "prompt",
      priority: "medium",
      title: "Some conversations end negatively",
      description: `${negativeEndingRate}% of conversations end with negative signals. Review the unanswered questions section for specific issues.`,
      metric: `${negativeEndingRate}% negative endings`,
    });
  }

  // ── 6. Trends ────────────────────────────────────────────────

  const prevEngaged = prevConversations.filter(
    (c) => c.messages.filter((m) => m.role === "USER").length >= 3
  ).length;
  const prevEmails = prevConversations.filter(
    (c) => c.visitorEmail || c.actionsUsed.includes("COLLECT_EMAIL")
  ).length;

  function trend(label: string, current: number, previous: number): TrendComparison {
    const changePercent = previous > 0
      ? Math.round(((current - previous) / previous) * 100)
      : current > 0 ? 100 : 0;
    return {
      metric: label,
      current,
      previous,
      changePercent,
      direction: changePercent > 5 ? "up" : changePercent < -5 ? "down" : "flat",
    };
  }

  const trends: TrendComparison[] = [
    trend("Conversations", conversations.length, prevConversations.length),
    trend("Engaged visitors", engaged, prevEngaged),
    trend("Emails captured", providedEmail, prevEmails),
    trend("Appointments", bookedAppointment,
      prevConversations.filter((c) => c.actionsUsed.includes("BOOK_APPOINTMENT")).length),
  ];

  return {
    topQuestions,
    conversionFunnel,
    quality,
    leadIntelligence,
    suggestions,
    trends,
    dateRange: { from: periodStart.toISOString(), to: now.toISOString() },
    conversationCount: conversations.length,
  };
}

// ── LLM Question Clustering ───────────────────────────────────────

async function clusterQuestions(
  questions: string[],
  pairs: { question: string; response: string }[]
): Promise<QuestionCluster[]> {
  try {
    const client = getClaudeClient();
    const sampleQuestions = questions.slice(0, 100);
    const total = questions.length;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You analyze customer chat questions and group them into themes.
Return ONLY a valid JSON array, no other text. Each item:
{"theme":"Short theme name","count":<estimated count from the ${total} questions>,"qualityScore":<0-100 how well these were answered>,"examples":["example 1","example 2"]}
Group into 5-8 themes max. qualityScore: 100=always answered well, 0=always fell back. Infer quality from the responses provided.`,
      messages: [{
        role: "user",
        content: `Here are ${sampleQuestions.length} sample opening questions (out of ${total} total):

${sampleQuestions.map((q, i) => `${i + 1}. "${q.slice(0, 120)}"`).join("\n")}

For quality scoring, here are some question-response pairs:
${pairs.slice(0, 30).map((p, i) => `${i + 1}. Q: "${p.question.slice(0, 80)}" → A contains fallback: ${FALLBACK_PHRASES.some((f) => p.response.includes(f)) ? "YES" : "NO"}`).join("\n")}`,
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const clusters = JSON.parse(jsonMatch[0]) as {
      theme: string;
      count: number;
      qualityScore: number;
      examples: string[];
    }[];

    return clusters.map((c) => ({
      theme: c.theme,
      count: c.count,
      percentage: total > 0 ? Math.round((c.count / total) * 100) : 0,
      qualityScore: Math.min(100, Math.max(0, c.qualityScore)),
      examples: (c.examples || []).slice(0, 3),
    }));
  } catch {
    return [];
  }
}
