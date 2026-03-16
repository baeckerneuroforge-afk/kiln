import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { authenticateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ALLOWED_TYPES = new Set(["URL", "TEXT", "FAQ", "PDF"]);

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(
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

    const body = await request.json();
    const type = typeof body.type === "string" ? body.type.toUpperCase() : "";
    const sourceName = typeof body.sourceName === "string" ? body.sourceName.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!ALLOWED_TYPES.has(type)) {
      return Response.json({ error: "Invalid knowledge type." }, { status: 400, headers: corsHeaders });
    }
    if (!sourceName || !content) {
      return Response.json({ error: "sourceName and content are required." }, { status: 400, headers: corsHeaders });
    }

    const knowledge = await prisma.knowledgeBase.create({
      data: {
        agentId: agent.id,
        type: type as "URL" | "TEXT" | "FAQ" | "PDF",
        sourceName,
        content,
        embeddingStatus: "PENDING",
      },
    });

    return Response.json(
      {
        id: knowledge.id,
        type: knowledge.type,
        sourceName: knowledge.sourceName,
        embeddingStatus: knowledge.embeddingStatus,
      },
      {
        status: 201,
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
