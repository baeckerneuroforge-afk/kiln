import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { calculateHealthScore, TeamHealthScore } from "@/lib/team-health";

// In-Memory Cache mit TTL (1 Stunde)
const cache = new Map<string, { data: TeamHealthScore; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 Stunde

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
    });

    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    // Cache prüfen
    const cacheKey = `health:${params.id}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Response.json(cached.data);
    }

    // Health Score berechnen
    const healthScore = await calculateHealthScore(params.id);

    // Im Cache speichern
    cache.set(cacheKey, {
      data: healthScore,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return Response.json(healthScore);
  } catch (err) {
    console.error("GET /api/teams/[id]/health error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
