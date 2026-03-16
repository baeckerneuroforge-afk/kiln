import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { authenticateApiKey } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// GET /api/v1/agents — Liste aller Agents des Users
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateApiKey(request.headers.get("authorization"));
    if (!authResult) {
      return Response.json(
        { error: "Invalid or missing API key. Use Authorization: Bearer sk-kiln-..." },
        { status: 401, headers: corsHeaders }
      );
    }
    waitUntil(authResult.touchLastUsed);

    // Rate Limiting
    const rateCheck = checkRateLimit(authResult.keyId);
    if (!rateCheck.allowed) {
      return Response.json(
        { error: "Rate limit exceeded. 100 requests per minute." },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(rateCheck.resetAt).toISOString(),
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const agents = await prisma.agent.findMany({
      where: { userId: authResult.userId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        llmModel: true,
        status: true,
        createdAt: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(
      {
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          description: a.description,
          model: a.llmModel,
          status: a.status,
          conversationCount: a._count.conversations,
          createdAt: a.createdAt,
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
