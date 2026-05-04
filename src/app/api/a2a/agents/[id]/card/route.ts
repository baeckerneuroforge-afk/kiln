import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAgentCard, deriveCapabilities } from "@/lib/a2a-protocol";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * GET /api/a2a/agents/[id]/card
 * Öffentlicher Endpunkt — gibt die A2A Agent Card als JSON zurück.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        a2aEnabled: true,
        a2aCapabilities: true,
        a2aCategory: true,
        a2aCreditCost: true,
        a2aRating: true,
        a2aUsageCount: true,
        actions: { select: { type: true, enabled: true } },
      },
    });

    if (!agent || agent.status !== "LIVE" || !agent.a2aEnabled) {
      return Response.json(
        { error: "Agent not found or A2A not enabled" },
        { status: 404, headers: corsHeaders }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    const capabilities = agent.a2aCapabilities.length > 0
      ? agent.a2aCapabilities
      : deriveCapabilities(agent.actions, agent.description);

    const card = buildAgentCard(
      agent.id,
      agent.name,
      agent.description || "",
      capabilities,
      baseUrl,
      {
        category: agent.a2aCategory || undefined,
        creditCost: agent.a2aCreditCost,
        rating: agent.a2aRating,
        usageCount: agent.a2aUsageCount,
      }
    );

    return Response.json(card, { headers: corsHeaders });
  } catch (error) {
    console.error("A2A card error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
