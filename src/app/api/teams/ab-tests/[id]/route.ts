import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getTestResults, routeExecution, recordABTestResult } from "@/lib/team-ab-testing";
import { TeamABTestStatus } from "@prisma/client";

// Test-Details mit Ergebnissen
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const test = await prisma.teamABTest.findFirst({
      where: { id: params.id, userId },
      include: {
        teamA: { select: { id: true, name: true } },
        teamB: { select: { id: true, name: true } },
        results: {
          orderBy: { createdAt: "desc" },
          take: 200,
        },
      },
    });

    if (!test) {
      return Response.json({ error: "Test not found" }, { status: 404 });
    }

    const stats = await getTestResults(test.id);

    return Response.json({ ...test, stats });
  } catch (err) {
    console.error("GET /api/teams/ab-tests/[id] error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

// Test aktualisieren (pause/resume/complete)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const test = await prisma.teamABTest.findFirst({
      where: { id: params.id, userId },
    });
    if (!test) {
      return Response.json({ error: "Test not found" }, { status: 404 });
    }

    const body = await request.json();
    const { status } = body as { status?: string };

    const validTransitions: Record<string, string[]> = {
      RUNNING: ["PAUSED", "COMPLETED"],
      PAUSED: ["RUNNING", "COMPLETED"],
      COMPLETED: [],
    };

    if (status) {
      const allowed = validTransitions[test.status] || [];
      if (!allowed.includes(status)) {
        return Response.json(
          { error: `Cannot transition from ${test.status} to ${status}` },
          { status: 400 }
        );
      }

      const updates: Record<string, unknown> = { status };
      if (status === "COMPLETED") {
        updates.completedAt = new Date();
      }

      const updated = await prisma.teamABTest.update({
        where: { id: params.id },
        data: updates,
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
        },
      });

      return Response.json(updated);
    }

    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  } catch (err) {
    console.error("PATCH /api/teams/ab-tests/[id] error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

// Execution durch A/B Test routen
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const test = await prisma.teamABTest.findFirst({
      where: { id: params.id, userId },
    });
    if (!test) {
      return Response.json({ error: "Test not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { goal } = body as { goal?: string };

    if (!goal) {
      return Response.json({ error: "goal is required" }, { status: 400 });
    }

    // Route zu Team A oder B
    const routing = await routeExecution(test.id);

    // Team-Execution über die bestehende Execute-API starten
    const executeRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/teams/${routing.teamId}/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify({ goal }),
      }
    );

    if (!executeRes.ok) {
      const err = await executeRes.json().catch(() => ({ error: "Execution failed" }));
      return Response.json(err, { status: executeRes.status });
    }

    const execData = await executeRes.json();

    // A/B Test Ergebnis registrieren (Status wird asynchron aktualisiert)
    await recordABTestResult(test.id, execData.executionId, routing.assignedTeam, {
      input: { goal },
      status: "RUNNING",
    });

    return Response.json({
      testId: test.id,
      assignedTeam: routing.assignedTeam,
      teamId: routing.teamId,
      executionId: execData.executionId,
    });
  } catch (err) {
    console.error("POST /api/teams/ab-tests/[id] (execute) error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
