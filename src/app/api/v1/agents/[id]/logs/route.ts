import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await authenticateApiKey(request.headers.get("authorization"));
    if (!authResult) {
      return Response.json(
        { error: "Invalid or missing API key. Use Authorization: Bearer sk-kiln-..." },
        { status: 401, headers: corsHeaders }
      );
    }
    waitUntil(authResult.touchLastUsed);

    const rateCheck = checkRateLimit(authResult.keyId);
    if (!rateCheck.allowed) {
      return Response.json(
        { error: "Rate limit exceeded. 100 requests per minute." },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId: authResult.userId },
      select: { id: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found or unauthorized" }, { status: 404, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") || "10", 10) || 10));

    const conversations = await prisma.conversation.findMany({
      where: { agentId: agent.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: { role: true, content: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return Response.json(
      {
        total: conversations.length,
        conversations: conversations.map((conversation) => ({
          id: conversation.id,
          sessionId: conversation.sessionId,
          channel: conversation.channel,
          leadScore: conversation.leadScore,
          visitorName: conversation.visitorName,
          visitorEmail: conversation.visitorEmail,
          messageCount: conversation._count.messages,
          createdAt: conversation.createdAt,
          messages: conversation.messages,
        })),
      },
      {
        headers: {
          ...corsHeaders,
          "X-RateLimit-Remaining": String(rateCheck.remaining),
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
