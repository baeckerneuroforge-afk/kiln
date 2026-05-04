import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { analyzeConversations, DeepDiveResult } from "@/lib/conversation-analytics";

export const dynamic = "force-dynamic";

// In-memory cache (per serverless instance)
const cache = new Map<string, { data: DeepDiveResult; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 Stunde

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
    const days = parseInt(url.searchParams.get("days") || "30");
    const validDays = [7, 30, 90].includes(days) ? days : 30;

    // Cache-Key
    const cacheKey = `${agent.id}:${validDays}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Response.json(cached.data);
    }

    // Schwere Berechnung — für kurze Zeiträume inline, für lange async
    if (validDays <= 30) {
      const result = await analyzeConversations(agent.id, validDays);
      cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return Response.json(result);
    }

    // Für 90 Tage: im Hintergrund berechnen, sofort cached oder leeres Ergebnis zurückgeben
    if (cached) {
      // Stale cache vorhanden — sofort zurückgeben und im Hintergrund aktualisieren
      waitUntil(
        analyzeConversations(agent.id, validDays).then((result) => {
          cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
        })
      );
      return Response.json(cached.data);
    }

    // Kein Cache — muss warten
    const result = await analyzeConversations(agent.id, validDays);
    cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
