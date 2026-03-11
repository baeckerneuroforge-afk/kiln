import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// Analytics-Daten für einen Agent laden
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
      select: { id: true, avgDealValue: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    // Zeitraum: letzte 30 Tage
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Alle Daten parallel laden
    const [conversations, leads, dailyStats, topIntentsRaw] = await Promise.all([
      // Conversations mit Message-Count und Metadaten
      prisma.conversation.findMany({
        where: { agentId: agent.id, createdAt: { gte: thirtyDaysAgo } },
        include: {
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: "desc" },
      }),

      // Leads im Zeitraum
      prisma.lead.findMany({
        where: { agentId: agent.id, createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: "desc" },
      }),

      // Tägliche AgentAnalytics (falls vorhanden)
      prisma.agentAnalytics.findMany({
        where: { agentId: agent.id, date: { gte: thirtyDaysAgo } },
        orderBy: { date: "asc" },
      }),

      // Top-Intents aus den letzten User-Nachrichten
      prisma.message.findMany({
        where: {
          conversation: { agentId: agent.id },
          role: "USER",
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { content: true },
        take: 200,
      }),
    ]);

    // Tägliche Conversations aggregieren (aus echten Daten)
    const dailyMap = new Map<string, { conversations: number; leads: number; appointments: number }>();
    for (let d = 0; d < 30; d++) {
      const date = new Date(thirtyDaysAgo);
      date.setDate(date.getDate() + d);
      const key = date.toISOString().split("T")[0];
      dailyMap.set(key, { conversations: 0, leads: 0, appointments: 0 });
    }

    for (const conv of conversations) {
      const key = conv.createdAt.toISOString().split("T")[0];
      const day = dailyMap.get(key);
      if (day) {
        day.conversations++;
        if (conv.actionsUsed.includes("BOOK_APPOINTMENT")) {
          day.appointments++;
        }
      }
    }

    for (const lead of leads) {
      const key = lead.createdAt.toISOString().split("T")[0];
      const day = dailyMap.get(key);
      if (day) day.leads++;
    }

    const chartData = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      conversations: data.conversations,
      leads: data.leads,
      appointments: data.appointments,
    }));

    // KPI Summary
    const totalConversations = conversations.length;
    const totalLeads = leads.length;
    const totalAppointments = conversations.filter((c) =>
      c.actionsUsed.includes("BOOK_APPOINTMENT")
    ).length;
    const avgDealValue = agent.avgDealValue || 0;
    const estimatedValue = (totalLeads * 0.1 + totalAppointments * 0.3) * avgDealValue;

    // Top-5 Intents via einfache Keyword-Extraktion
    const intentCounts = new Map<string, number>();
    const intentKeywords = [
      "Termin", "Preis", "Kosten", "Buchung", "Öffnungszeiten",
      "Kontakt", "Angebot", "Beratung", "Demo", "Support",
      "appointment", "price", "cost", "booking", "hours",
      "contact", "offer", "consultation", "demo", "support",
      "help", "info", "question", "problem", "cancel",
    ];
    for (const msg of topIntentsRaw) {
      const lower = msg.content.toLowerCase();
      for (const kw of intentKeywords) {
        if (lower.includes(kw.toLowerCase())) {
          intentCounts.set(kw, (intentCounts.get(kw) || 0) + 1);
        }
      }
    }
    const topIntents = Array.from(intentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([intent, count]) => ({ intent, count }));

    // Conversation Log (letzte 50)
    const conversationLog = conversations.slice(0, 50).map((c) => ({
      id: c.id,
      sessionId: c.sessionId,
      channel: c.channel,
      leadScore: c.leadScore,
      sentiment: c.sentiment,
      actionsUsed: c.actionsUsed,
      visitorName: c.visitorName,
      visitorEmail: c.visitorEmail,
      messageCount: c._count.messages,
      createdAt: c.createdAt,
    }));

    // ROI-Berechnung
    const roi = avgDealValue > 0
      ? {
          avgDealValue,
          estimatedValue: Math.round(estimatedValue),
          leadsValue: Math.round(totalLeads * 0.1 * avgDealValue),
          appointmentsValue: Math.round(totalAppointments * 0.3 * avgDealValue),
        }
      : null;

    return Response.json({
      kpi: {
        totalConversations,
        totalLeads,
        totalAppointments,
        estimatedValue: Math.round(estimatedValue),
      },
      chartData,
      topIntents,
      conversationLog,
      roi,
      avgDealValue: agent.avgDealValue,
      dailyStats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
