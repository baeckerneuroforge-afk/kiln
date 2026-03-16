import { auth } from "@clerk/nextjs/server";
import { ensureCreditsReset, getPlanCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek() {
  const date = startOfToday();
  const currentDay = date.getDay();
  const diff = currentDay === 0 ? -6 : 1 - currentDay;
  date.setDate(date.getDate() + diff);
  return date;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

type AttentionItem = {
  id: string;
  entityId: string;
  agentId: string | null;
  agentName: string;
  issueType: string;
  detail: string;
  severity: "warning" | "critical";
  fixHref: string;
};

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await ensureCreditsReset(userId);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const today = startOfToday();
    const weekStart = startOfWeek();
    const sevenDaysAgo = daysAgo(7);
    const twentyFourHoursAgo = daysAgo(1);
    const last7DaysByDate = Array.from({ length: 7 }, (_, index) => {
      const date = daysAgo(6 - index);
      date.setHours(0, 0, 0, 0);
      return date.toISOString().split("T")[0];
    });

    const agents = await prisma.agent.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const agentIds = agents.map((agent) => agent.id);
    const agentNameMap = new Map(agents.map((agent) => [agent.id, agent.name]));
    const agentCount = agents.length;
    const totalCredits = user.aiCreditsMonthly || getPlanCredits(user.plan, user.creditTier);
    const creditsRatio = totalCredits > 0 ? user.aiCreditsBalance / totalCredits : 0;

    const [
      conversationsToday,
      conversationsWeek,
      leadsToday,
      leadsWeek,
      recentConversations,
      recentConversations7d,
      leadsLast7d,
      recentLeads,
      recentAppointments,
      recentTeamExecutions,
      recentHandoffs,
      failedTaskLogs,
      teams,
    ] = await Promise.all([
      agentIds.length > 0
        ? prisma.conversation.count({
            where: {
              agentId: { in: agentIds },
              createdAt: { gte: today },
            },
          })
        : 0,
      agentIds.length > 0
        ? prisma.conversation.count({
            where: {
              agentId: { in: agentIds },
              createdAt: { gte: weekStart },
            },
          })
        : 0,
      agentIds.length > 0
        ? prisma.lead.count({
            where: {
              agentId: { in: agentIds },
              createdAt: { gte: today },
            },
          })
        : 0,
      agentIds.length > 0
        ? prisma.lead.count({
            where: {
              agentId: { in: agentIds },
              createdAt: { gte: weekStart },
            },
          })
        : 0,
      agentIds.length > 0
        ? prisma.conversation.findMany({
            where: { agentId: { in: agentIds } },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              agentId: true,
              createdAt: true,
            },
          })
        : [],
      agentIds.length > 0
        ? prisma.conversation.findMany({
            where: {
              agentId: { in: agentIds },
              createdAt: { gte: sevenDaysAgo },
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              agentId: true,
              createdAt: true,
              updatedAt: true,
              actionsUsed: true,
              visitorEmail: true,
              messages: {
                orderBy: { createdAt: "asc" },
                select: {
                  role: true,
                  content: true,
                },
              },
            },
          })
        : [],
      agentIds.length > 0
        ? prisma.lead.findMany({
            where: {
              agentId: { in: agentIds },
              createdAt: { gte: sevenDaysAgo },
            },
            select: {
              id: true,
              createdAt: true,
            },
          })
        : [],
      agentIds.length > 0
        ? prisma.lead.findMany({
            where: { agentId: { in: agentIds } },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              agentId: true,
              email: true,
              createdAt: true,
            },
          })
        : [],
      agentIds.length > 0
        ? prisma.conversation.findMany({
            where: {
              agentId: { in: agentIds },
              actionsUsed: { has: "BOOK_APPOINTMENT" },
            },
            orderBy: { updatedAt: "desc" },
            take: 20,
            select: {
              id: true,
              agentId: true,
              updatedAt: true,
            },
          })
        : [],
      prisma.teamExecution.findMany({
        where: {
          userId,
          status: { in: ["COMPLETED", "FAILED", "PARTIAL"] },
        },
        orderBy: { startedAt: "desc" },
        take: 20,
        include: {
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      agentIds.length > 0
        ? prisma.orchestrationHandoff.findMany({
            where: { sourceAgentId: { in: agentIds } },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              sourceAgentId: true,
              reason: true,
              createdAt: true,
            },
          })
        : [],
      agentIds.length > 0
        ? prisma.teamExecutionLog.findMany({
            where: {
              agentId: { in: agentIds },
              attempt: 2,
              status: "FAILED",
              completedAt: { gte: twentyFourHoursAgo },
            },
            orderBy: { completedAt: "desc" },
            select: {
              id: true,
              agentId: true,
              completedAt: true,
              execution: {
                select: {
                  team: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          })
        : [],
      prisma.agentTeam.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          goal: true,
          status: true,
        },
      }),
    ]);

    const dailyActivityMap = new Map<string, { date: string; conversations: number; leads: number }>(
      last7DaysByDate.map((date) => [date, { date, conversations: 0, leads: 0 }])
    );

    const conversationsByAgent = new Map<string, typeof recentConversations7d>();
    for (const conversation of recentConversations7d) {
      const list = conversationsByAgent.get(conversation.agentId) || [];
      list.push(conversation);
      conversationsByAgent.set(conversation.agentId, list);

      const dateKey = conversation.createdAt.toISOString().split("T")[0];
      const day = dailyActivityMap.get(dateKey);
      if (day) {
        day.conversations += 1;
      }
    }

    for (const lead of leadsLast7d) {
      const dateKey = lead.createdAt.toISOString().split("T")[0];
      const day = dailyActivityMap.get(dateKey);
      if (day) {
        day.leads += 1;
      }
    }

    const attentionItems: AttentionItem[] = [];

    for (const agent of agents) {
      const conversations = conversationsByAgent.get(agent.id) || [];
      const userMessageOnlyCount = conversations.filter(
        (conversation) => conversation.messages.filter((message) => message.role === "USER").length === 1
      ).length;
      const bounceRate = conversations.length > 0 ? userMessageOnlyCount / conversations.length : 0;

      let unansweredCount = 0;
      for (const conversation of conversations) {
        for (const message of conversation.messages) {
          if (message.role !== "ASSISTANT") continue;
          const lowerContent = message.content.toLowerCase();
          if (FALLBACK_PHRASES.some((phrase) => lowerContent.includes(phrase))) {
            unansweredCount += 1;
          }
        }
      }

      if (conversations.length > 0 && bounceRate > 0.6) {
        attentionItems.push({
          id: `${agent.id}-bounce`,
          entityId: agent.id,
          agentId: agent.id,
          agentName: agent.name,
          issueType: "High bounce rate",
          detail: `${Math.round(bounceRate * 100)}% of last 7-day conversations ended after one user message.`,
          severity: "warning",
          fixHref: `/dashboard/agents/${agent.id}?tab=eval`,
        });
      }

      if (unansweredCount > 5) {
        attentionItems.push({
          id: `${agent.id}-unanswered`,
          entityId: agent.id,
          agentId: agent.id,
          agentName: agent.name,
          issueType: "Unanswered questions",
          detail: `${unansweredCount} fallback-style responses detected in the last 7 days.`,
          severity: "critical",
          fixHref: `/dashboard/agents/${agent.id}?tab=eval`,
        });
      }

      if (agent.status === "LIVE" && conversations.length === 0) {
        attentionItems.push({
          id: `${agent.id}-inactive`,
          entityId: agent.id,
          agentId: agent.id,
          agentName: agent.name,
          issueType: "Low activity",
          detail: "No conversations in the last 7 days while the agent is live.",
          severity: "warning",
          fixHref: `/dashboard/agents/${agent.id}?tab=eval`,
        });
      }
    }

    const failedTaskByAgent = new Map<string, { teamId: string; teamName: string }>();
    for (const failedLog of failedTaskLogs) {
      if (!failedLog.agentId || failedTaskByAgent.has(failedLog.agentId)) continue;
      failedTaskByAgent.set(failedLog.agentId, {
        teamId: failedLog.execution.team.id,
        teamName: failedLog.execution.team.name,
      });
    }

    for (const [agentId, teamInfo] of Array.from(failedTaskByAgent.entries())) {
      attentionItems.push({
        id: `${agentId}-team-failure`,
        entityId: agentId,
        agentId,
        agentName: agentNameMap.get(agentId) || "Unknown Agent",
        issueType: "Failed team execution",
        detail: `A team task failed in "${teamInfo.teamName}" during the last 24 hours.`,
        severity: "critical",
        fixHref: `/dashboard/teams/${teamInfo.teamId}`,
      });
    }

    if (totalCredits > 0 && creditsRatio <= 0.2) {
      attentionItems.push({
        id: "workspace-credits-low",
        entityId: "workspace-credits-low",
        agentId: null,
        agentName: "Workspace Credits",
        issueType: "Credits below 20%",
        detail: `${user.aiCreditsBalance} of ${totalCredits} credits remaining.`,
        severity: "critical",
        fixHref: "/dashboard/settings",
      });
    }

    const attentionCount = new Set(attentionItems.map((item) => item.entityId)).size;

    const activityFeed = [
      ...recentConversations.map((conversation) => ({
        id: `conversation-${conversation.id}`,
        type: "conversation",
        title: `New conversation on ${agentNameMap.get(conversation.agentId) || "Agent"}`,
        description: "A visitor started a new conversation.",
        timestamp: conversation.createdAt.toISOString(),
        href: `/dashboard/agents/${conversation.agentId}?tab=logs`,
      })),
      ...recentLeads.map((lead) => ({
        id: `lead-${lead.id}`,
        type: "lead",
        title: `Lead captured: ${lead.email} on ${agentNameMap.get(lead.agentId) || "Agent"}`,
        description: "A lead record was created by an agent action.",
        timestamp: lead.createdAt.toISOString(),
        href: `/dashboard/agents/${lead.agentId}?tab=analytics`,
      })),
      ...recentAppointments.map((conversation) => ({
        id: `appointment-${conversation.id}`,
        type: "appointment",
        title: `Appointment booked on ${agentNameMap.get(conversation.agentId) || "Agent"}`,
        description: "A conversation triggered the appointment booking action.",
        timestamp: conversation.updatedAt.toISOString(),
        href: `/dashboard/agents/${conversation.agentId}?tab=analytics`,
      })),
      ...recentTeamExecutions.map((execution) => ({
        id: `team-execution-${execution.id}`,
        type: "team_execution",
        title: `Team execution ${execution.status === "FAILED" || execution.status === "PARTIAL" ? "failed" : "completed"}: ${execution.team.name}`,
        description: execution.goal || "Team execution finished.",
        timestamp: (execution.completedAt || execution.startedAt).toISOString(),
        href: `/dashboard/teams/${execution.team.id}`,
      })),
      ...recentHandoffs.map((handoff) => ({
        id: `handoff-${handoff.id}`,
        type: "handoff",
        title: `Handoff requested on ${agentNameMap.get(handoff.sourceAgentId) || "Agent"}`,
        description: handoff.reason.length > 140 ? `${handoff.reason.slice(0, 139)}…` : handoff.reason,
        timestamp: handoff.createdAt.toISOString(),
        href: `/dashboard/agents/${handoff.sourceAgentId}?tab=logs`,
      })),
    ]
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 20);

    return Response.json({
      eligible: agentCount > 1,
      agentCount,
      overview: {
        totalActiveAgents: agents.filter((agent) => agent.status === "LIVE").length,
        conversationsToday,
        conversationsWeek,
        leadsToday,
        leadsWeek,
        creditsRemaining: user.aiCreditsBalance,
        totalCredits,
        creditsRatio: totalCredits > 0 ? Number(creditsRatio.toFixed(2)) : 0,
        agentsNeedingAttention: attentionCount,
      },
      dailyActivity: Array.from(dailyActivityMap.values()),
      attentionItems,
      activityFeed,
      teams,
      quickLinks: {
        createAgentHref: "/dashboard/agents/new",
        conversationsHref: "/dashboard/agents",
      },
    });
  } catch (error) {
    console.error("GET /api/dashboard/operations error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
