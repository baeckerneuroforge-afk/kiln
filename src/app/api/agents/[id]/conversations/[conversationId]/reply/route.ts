import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// POST — Agent owner sends a human reply into a conversation
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; conversationId: string } }
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

    const conversation = await prisma.conversation.findFirst({
      where: { id: params.conversationId, agentId: params.id },
    });
    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return Response.json({ error: "content is required" }, { status: 400 });
    }

    // Create HUMAN message
    const message = await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: "HUMAN",
        content: content.trim(),
      },
    });

    // Update handoff status to RESPONDED
    if (conversation.handoffStatus === "REQUESTED") {
      await prisma.conversation.update({
        where: { id: params.conversationId },
        data: { handoffStatus: "RESPONDED" },
      });
    }

    return Response.json(message, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// GET — Poll for new messages (used by embed widget for real-time human replies)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; conversationId: string } }
) {
  try {
    const url = new URL(request.url);
    const after = url.searchParams.get("after");

    // No auth required for embed widget polling — but scope to conversation
    const conversation = await prisma.conversation.findFirst({
      where: { id: params.conversationId, agentId: params.id },
      select: { id: true },
    });
    if (!conversation) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const where: { conversationId: string; role: "HUMAN"; createdAt?: { gt: Date } } = {
      conversationId: params.conversationId,
      role: "HUMAN",
    };
    if (after) {
      where.createdAt = { gt: new Date(after) };
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { id: true, content: true, createdAt: true, role: true },
    });

    return Response.json(
      { messages },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: errMsg }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
