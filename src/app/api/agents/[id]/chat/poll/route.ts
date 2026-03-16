import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// Poll for human messages in a conversation by sessionId
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const after = url.searchParams.get("after");

    if (!sessionId) {
      return Response.json({ messages: [] }, { headers: corsHeaders });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { agentId: params.id, sessionId },
      select: { id: true, handoffStatus: true },
    });

    if (!conversation) {
      return Response.json({ messages: [], handoffActive: false }, { headers: corsHeaders });
    }

    const where: { conversationId: string; role: "HUMAN"; createdAt?: { gt: Date } } = {
      conversationId: conversation.id,
      role: "HUMAN",
    };
    if (after) {
      where.createdAt = { gt: new Date(after) };
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { id: true, content: true, createdAt: true },
    });

    return Response.json(
      {
        messages: messages.map((m) => ({
          id: m.id,
          content: m.content,
          createdAt: m.createdAt,
        })),
        handoffActive: conversation.handoffStatus === "REQUESTED",
      },
      { headers: corsHeaders }
    );
  } catch {
    return Response.json({ messages: [], handoffActive: false }, { headers: corsHeaders });
  }
}
