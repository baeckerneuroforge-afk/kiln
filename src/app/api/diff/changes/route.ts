/**
 * Diff Changes API
 * GET: Liste aller erkannten Änderungen (optional gefiltert)
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
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

  try {
    // Nur Tracker für Agents des Users
    const agents = await prisma.agent.findMany({
      where: { userId },
      select: { id: true },
    });
    const agentIds = agents.map((a) => a.id);

    const trackerFilter = agentId
      ? { agentId: { equals: agentId, in: agentIds } }
      : { agentId: { in: agentIds } };

    const trackers = await prisma.diffTracker.findMany({
      where: trackerFilter,
      select: { id: true, url: true },
    });
    const trackerIds = trackers.map((t) => t.id);
    const trackerUrlMap = new Map(trackers.map((t) => [t.id, t.url]));

    const changes = await prisma.diffChange.findMany({
      where: { diffTrackerId: { in: trackerIds } },
      include: {
        snapshotBefore: { select: { screenshotUrl: true } },
        snapshotAfter: { select: { screenshotUrl: true } },
      },
      orderBy: { detectedAt: "desc" },
      take: limit,
    });

    return NextResponse.json(
      changes.map((c) => ({
        id: c.id,
        url: trackerUrlMap.get(c.diffTrackerId) || "",
        changes: c.changes,
        summary: c.summary,
        importance: c.importance,
        detectedAt: c.detectedAt,
        snapshotBeforeUrl: c.snapshotBefore?.screenshotUrl,
        snapshotAfterUrl: c.snapshotAfter?.screenshotUrl,
      })),
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch changes" },
      { status: 500 },
    );
  }
}
