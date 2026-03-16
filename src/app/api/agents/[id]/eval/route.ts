import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const FALLBACK_PHRASES = [
  "i don't know",
  "i am not sure",
  "i'm not sure",
  "i can't help with that",
  "i cannot help with that",
  "i don't have that information",
  "ich weiss es nicht",
  "ich weiß es nicht",
  "ich bin mir nicht sicher",
  "dabei kann ich nicht helfen",
];

function normalizeTopic(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLength = 140) {
  const text = value.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
      select: {
        id: true,
        actions: {
          where: { enabled: true },
          select: { type: true },
        },
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const conversations = await prisma.conversation.findMany({
      where: {
        agentId: agent.id,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        sessionId: true,
        leadScore: true,
        actionsUsed: true,
        visitorEmail: true,
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            content: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const periodCounts = {
      last7Days: conversations.filter((conversation) => conversation.createdAt >= sevenDaysAgo).length,
      last30Days: conversations.length,
    };

    const totalMessages = conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0);
    const averageMessagesPerConversation = conversations.length > 0
      ? totalMessages / conversations.length
      : 0;

    const responseTimesMs: number[] = [];
    let bouncedConversations = 0;
    let actionTriggeredConversations = 0;
    let leadCaptureConversations = 0;
    let appointmentConversations = 0;
    let successfulActionConversations = 0;

    const unansweredQuestions: {
      conversationId: string;
      question: string;
      response: string;
      createdAt: string;
    }[] = [];

    const topicCounts = new Map<string, { topic: string; count: number }>();

    for (const conversation of conversations) {
      const userMessages = conversation.messages.filter((message) => message.role === "USER");

      if (userMessages.length === 1) {
        bouncedConversations++;
      }

      if (conversation.actionsUsed.length > 0) {
        actionTriggeredConversations++;
      }

      if (conversation.actionsUsed.includes("COLLECT_EMAIL") || Boolean(conversation.visitorEmail)) {
        leadCaptureConversations++;
      }

      if (conversation.actionsUsed.includes("BOOK_APPOINTMENT")) {
        appointmentConversations++;
      }

      const hasSuccessfulOutcome = (
        (conversation.actionsUsed.includes("COLLECT_EMAIL") && Boolean(conversation.visitorEmail)) ||
        (conversation.actionsUsed.includes("SCORE_LEAD") && conversation.leadScore !== null) ||
        conversation.actionsUsed.includes("BOOK_APPOINTMENT")
      );

      if (hasSuccessfulOutcome) {
        successfulActionConversations++;
      }

      let pendingUserTimestamp: Date | null = null;

      for (let index = 0; index < conversation.messages.length; index++) {
        const message = conversation.messages[index];

        if (message.role === "USER") {
          pendingUserTimestamp = message.createdAt;
          continue;
        }

        if (message.role !== "ASSISTANT") continue;

        if (pendingUserTimestamp) {
          responseTimesMs.push(message.createdAt.getTime() - pendingUserTimestamp.getTime());
          pendingUserTimestamp = null;
        }

        const lowerContent = message.content.toLowerCase();
        if (FALLBACK_PHRASES.some((phrase) => lowerContent.includes(phrase))) {
          let originalQuestion = "";

          for (let prevIndex = index - 1; prevIndex >= 0; prevIndex--) {
            if (conversation.messages[prevIndex].role === "USER") {
              originalQuestion = conversation.messages[prevIndex].content;
              break;
            }
          }

          if (originalQuestion) {
            unansweredQuestions.push({
              conversationId: conversation.id,
              question: truncate(originalQuestion, 180),
              response: truncate(message.content, 180),
              createdAt: message.createdAt.toISOString(),
            });
          }
        }
      }

      const openingQuestion = userMessages[0]?.content;
      if (openingQuestion) {
        const normalized = normalizeTopic(openingQuestion);
        if (normalized) {
          const existing = topicCounts.get(normalized);
          if (existing) {
            existing.count += 1;
          } else {
            topicCounts.set(normalized, {
              topic: truncate(openingQuestion, 120),
              count: 1,
            });
          }
        }
      }
    }

    const averageResponseTimeSeconds = responseTimesMs.length > 0
      ? responseTimesMs.reduce((sum, value) => sum + value, 0) / responseTimesMs.length / 1000
      : null;

    const bounceRate = conversations.length > 0
      ? (bouncedConversations / conversations.length) * 100
      : 0;

    const topTopics = Array.from(topicCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const unresolvedQuestionList = unansweredQuestions
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 20);

    return Response.json({
      configuredActions: agent.actions.map((action) => action.type),
      summary: {
        totalConversations7d: periodCounts.last7Days,
        totalConversations30d: periodCounts.last30Days,
        averageMessagesPerConversation: Number(averageMessagesPerConversation.toFixed(1)),
        averageResponseTimeSeconds: averageResponseTimeSeconds !== null
          ? Number(averageResponseTimeSeconds.toFixed(1))
          : null,
        bounceRate: Number(bounceRate.toFixed(1)),
        actionTriggeredConversations,
        leadCaptureConversations,
        appointmentConversations,
      },
      unansweredQuestions: unresolvedQuestionList,
      topTopics,
      funnel: {
        totalConversations: periodCounts.last30Days,
        actionTriggeredConversations,
        successfulActionConversations,
      },
      periodComparison: [
        { label: "Last 7 Days", conversations: periodCounts.last7Days },
        { label: "Last 30 Days", conversations: periodCounts.last30Days },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
