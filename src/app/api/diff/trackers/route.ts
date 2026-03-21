/**
 * Diff Trackers API
 * GET: Liste aller Diff-Tracker (optional nach agentId gefiltert)
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");

  try {
    // Nur Tracker für Agents des Users laden
    const agents = await prisma.agent.findMany({
      where: { userId },
      select: { id: true },
    });
    const agentIds = agents.map((a) => a.id);

    const trackers = await prisma.diffTracker.findMany({
      where: {
        agentId: agentId ? { equals: agentId, in: agentIds } : { in: agentIds },
      },
      include: {
        _count: { select: { changes: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(
      trackers.map((t) => ({
        id: t.id,
        url: t.url,
        schedule: t.schedule,
        sensitivity: t.sensitivity,
        isActive: t.isActive,
        lastCheckedAt: t.lastCheckedAt,
        lastChangeDetectedAt: t.lastChangeDetectedAt,
        changeCount: t._count.changes,
      })),
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch trackers" },
      { status: 500 },
    );
  }
}
