import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type ConversationStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "HANDOFF_REQUESTED"
  | "HANDOFF_RESPONDED";

function deriveConversationStatus(
  handoffStatus: "REQUESTED" | "RESPONDED" | null,
  lastRole: "USER" | "ASSISTANT" | "SYSTEM" | "HUMAN" | null
): ConversationStatus {
  if (handoffStatus === "REQUESTED") return "HANDOFF_REQUESTED";
  if (handoffStatus === "RESPONDED") return "HANDOFF_RESPONDED";
  if (lastRole === "USER") return "ACTIVE";
  return "COMPLETED";
}

function matchesStatusFilter(status: ConversationStatus, filter: string | null) {
  if (!filter) return true;
  if (filter === "handoff") {
    return status === "HANDOFF_REQUESTED" || status === "HANDOFF_RESPONDED";
  }
  if (filter === "active") return status === "ACTIVE";
  if (filter === "completed") return status === "COMPLETED";
  return true;
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function escapeCsvCell(value: string) {
  const escaped = value.replace(/"/g, '""').replace(/\n/g, " ");
  return `"${escaped}"`;
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10) || 1, 1);
    const agentId = url.searchParams.get("agentId");
    const statusFilter = url.searchParams.get("status");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const search = url.searchParams.get("search")?.trim();
    const format = url.searchParams.get("format");

    const agents = await prisma.agent.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        status: true,
      },
      orderBy: { name: "asc" },
    });

    const ownedAgentIds = agents.map((agent) => agent.id);
    if (ownedAgentIds.length === 0) {
      return Response.json({
        conversations: [],
        agents,
        pagination: {
          page: 1,
          pageSize: PAGE_SIZE,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }

    const where: Prisma.ConversationWhereInput = {
      agentId: {
        in: agentId && ownedAgentIds.includes(agentId) ? [agentId] : ownedAgentIds,
      },
    };

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        (where.createdAt as Prisma.DateTimeFilter).lte = end;
      }
    }

    if (search) {
      where.OR = [
        { visitorEmail: { contains: search, mode: "insensitive" } },
        { visitorName: { contains: search, mode: "insensitive" } },
        {
          messages: {
            some: {
              content: { contains: search, mode: "insensitive" },
            },
          },
        },
      ];
    }

    const allMatchingConversations = await prisma.conversation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            imageUrl: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    const serialized = allMatchingConversations
      .map((conversation) => {
        const firstUserMessage = conversation.messages.find((message) => message.role === "USER");
        const lastMessage = conversation.messages[conversation.messages.length - 1] || null;
        const startedAt = conversation.createdAt;
        const endedAt = lastMessage?.createdAt || conversation.updatedAt;
        const derivedStatus = deriveConversationStatus(conversation.handoffStatus, lastMessage?.role || null);

        return {
          id: conversation.id,
          agentId: conversation.agentId,
          agentName: conversation.agent.name,
          sessionId: conversation.sessionId,
          visitorName: conversation.visitorName,
          visitorEmail: conversation.visitorEmail,
          firstMessagePreview: truncate(firstUserMessage?.content || "No user message", 60),
          firstMessage: firstUserMessage?.content || "",
          status: derivedStatus,
          handoffStatus: conversation.handoffStatus,
          messagesCount: conversation._count.messages,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: Math.max(endedAt.getTime() - startedAt.getTime(), 0),
          actionsUsed: conversation.actionsUsed,
          messages: conversation.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            imageUrl: message.imageUrl || null,
            createdAt: message.createdAt.toISOString(),
          })),
        };
      })
      .filter((conversation) => matchesStatusFilter(conversation.status, statusFilter));

    if (format === "csv") {
      const csvRows = [
        [
          "Agent",
          "Visitor",
          "Status",
          "Started",
          "Duration Seconds",
          "Messages Count",
          "First Message",
          "Transcript",
        ].join(","),
      ];

      for (const conversation of serialized) {
        const transcript = conversation.messages
          .map((message) => `${message.role}: ${message.content}`)
          .join(" | ");

        csvRows.push(
          [
            escapeCsvCell(conversation.agentName),
            escapeCsvCell(conversation.visitorEmail || "Anonymous"),
            escapeCsvCell(conversation.status),
            escapeCsvCell(conversation.startedAt),
            String(Math.round(conversation.durationMs / 1000)),
            String(conversation.messagesCount),
            escapeCsvCell(conversation.firstMessage),
            escapeCsvCell(transcript),
          ].join(",")
        );
      }

      return new Response(csvRows.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="kiln-conversations.csv"',
        },
      });
    }

    const total = serialized.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / PAGE_SIZE);
    const startIndex = (page - 1) * PAGE_SIZE;
    const paginated = serialized.slice(startIndex, startIndex + PAGE_SIZE);

    return Response.json({
      conversations: paginated,
      agents,
      filters: {
        agentId: agentId || "",
        status: statusFilter || "",
        dateFrom: dateFrom || "",
        dateTo: dateTo || "",
        search: search || "",
      },
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
