import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// Conversation Logs mit Filtern laden
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const scoreMin = url.searchParams.get("scoreMin");
    const scoreMax = url.searchParams.get("scoreMax");
    const action = url.searchParams.get("action");
    const channel = url.searchParams.get("channel");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const search = url.searchParams.get("search");
    const format = url.searchParams.get("format"); // "csv" or default json

    // Filter aufbauen
    const where: Prisma.ConversationWhereInput = {
      agentId: agent.id,
    };

    if (scoreMin || scoreMax) {
      where.leadScore = {};
      if (scoreMin) (where.leadScore as Prisma.IntNullableFilter).gte = parseInt(scoreMin);
      if (scoreMax) (where.leadScore as Prisma.IntNullableFilter).lte = parseInt(scoreMax);
    }

    if (action) {
      where.actionsUsed = { has: action };
    }

    if (channel) {
      where.channel = channel as "WEB" | "WHATSAPP" | "INSTAGRAM" | "TELEGRAM" | "VOICE" | "SLACK" | "EMAIL";
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        (where.createdAt as Prisma.DateTimeFilter).lte = to;
      }
    }

    // Conversations laden
    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: { role: true, content: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Search-Filter auf Messages anwenden (nach DB-Query)
    let filtered = conversations;
    if (search) {
      const q = search.toLowerCase();
      filtered = conversations.filter((c) =>
        c.visitorEmail?.toLowerCase().includes(q) ||
        c.visitorName?.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
      );
    }

    // CSV Export
    if (format === "csv") {
      const csvRows = [
        ["Date", "Visitor Email", "Visitor Name", "Messages", "Lead Score", "Actions", "Channel", "Conversation"].join(","),
      ];

      for (const conv of filtered) {
        const transcript = conv.messages
          .map((m) => `${m.role}: ${m.content.replace(/"/g, '""').replace(/\n/g, " ")}`)
          .join(" | ");

        csvRows.push([
          new Date(conv.createdAt).toISOString(),
          conv.visitorEmail || "",
          conv.visitorName || "",
          conv._count.messages.toString(),
          conv.leadScore?.toString() || "",
          conv.actionsUsed.join("; "),
          conv.channel,
          `"${transcript}"`,
        ].join(","));
      }

      return new Response(csvRows.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="agent-logs-${agent.id}.csv"`,
        },
      });
    }

    // JSON Response
    const result = filtered.map((c) => ({
      id: c.id,
      sessionId: c.sessionId,
      channel: c.channel,
      leadScore: c.leadScore,
      sentiment: c.sentiment,
      actionsUsed: c.actionsUsed,
      visitorName: c.visitorName,
      visitorEmail: c.visitorEmail,
      handoffStatus: c.handoffStatus,
      messageCount: c._count.messages,
      createdAt: c.createdAt,
      messages: c.messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    }));

    return Response.json({ conversations: result, total: result.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
