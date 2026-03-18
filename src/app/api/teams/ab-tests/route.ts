import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createABTest } from "@/lib/team-ab-testing";

// Liste aller A/B Tests
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tests = await prisma.teamABTest.findMany({
      where: { userId },
      include: {
        teamA: { select: { id: true, name: true } },
        teamB: { select: { id: true, name: true } },
        _count: { select: { results: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(tests);
  } catch (err) {
    console.error("GET /api/teams/ab-tests error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

// Neuen A/B Test erstellen
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, teamAId, teamBId, splitPercentage, metric, maxExecutions } = body;

    if (!name || !teamAId || !teamBId) {
      return Response.json({ error: "name, teamAId, and teamBId are required" }, { status: 400 });
    }

    const test = await createABTest(userId, {
      name,
      teamAId,
      teamBId,
      splitPercentage,
      metric,
      maxExecutions,
    });

    return Response.json(test, { status: 201 });
  } catch (err) {
    console.error("POST /api/teams/ab-tests error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
