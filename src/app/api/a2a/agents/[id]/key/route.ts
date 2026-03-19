import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { regenerateA2AKey, ensureA2AKey } from "@/lib/a2a-protocol";
import { getA2AUsageStats } from "@/lib/a2a-billing";

// GET — A2A Key + Stats laden
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
      select: { id: true, a2aApiKey: true, a2aCreditCost: true },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    // Key sicherstellen
    const key = await ensureA2AKey(params.id);
    const stats = await getA2AUsageStats(params.id);

    return Response.json({
      a2aApiKey: key,
      a2aCreditCost: agent.a2aCreditCost,
      stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST — Key regenerieren
export async function POST(
  _request: NextRequest,
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

    const newKey = await regenerateA2AKey(params.id);
    return Response.json({ a2aApiKey: newKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
