import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveCapabilities } from "@/lib/a2a-protocol";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * GET /api/a2a/directory — Alle öffentlichen A2A Agents.
 * Query: ?search=keyword&category=Sales
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search")?.toLowerCase() || "";
    const category = searchParams.get("category") || "";

    const agents = await prisma.agent.findMany({
      where: {
        a2aEnabled: true,
        status: "LIVE",
        ...(category ? { a2aCategory: category } : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        a2aCapabilities: true,
        a2aCategory: true,
        a2aCreditCost: true,
        a2aRating: true,
        a2aUsageCount: true,
        a2aAvgResponseMs: true,
        actions: { select: { type: true, enabled: true } },
      },
      orderBy: { a2aUsageCount: "desc" },
      take: 50,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    let results = agents.map((agent) => {
      const capabilities = agent.a2aCapabilities.length > 0
        ? agent.a2aCapabilities
        : deriveCapabilities(agent.actions, agent.description);

      return {
        id: agent.id,
        name: agent.name,
        description: agent.description || "",
        capabilities,
        category: agent.a2aCategory || "Other",
        creditCost: agent.a2aCreditCost,
        rating: agent.a2aRating,
        usageCount: agent.a2aUsageCount,
        avgResponseMs: agent.a2aAvgResponseMs,
        cardUrl: `${baseUrl}/api/a2a/agents/${agent.id}/card`,
        endpoint: `${baseUrl}/api/a2a/agents/${agent.id}/message`,
      };
    });

    // Client-seitige Suche
    if (search) {
      results = results.filter(
        (a) =>
          a.name.toLowerCase().includes(search) ||
          a.description.toLowerCase().includes(search) ||
          a.capabilities.some((c) => c.toLowerCase().includes(search))
      );
    }

    return Response.json({ agents: results, total: results.length }, { headers: corsHeaders });
  } catch (error) {
    console.error("A2A directory error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
  }
}
