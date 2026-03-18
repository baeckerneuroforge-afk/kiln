import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { canEditTeam } from "@/lib/team-permissions";
import {
  executeWorkflow,
  isWorkflowTeam,
} from "@/lib/services/workflow-runtime";
import { loadTeamExecutionRuntimeContext } from "@/lib/services/team-runtime";

// POST: Start a debug (step-by-step) workflow execution
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await canEditTeam(params.id, userId))) {
      return Response.json(
        { error: "Team not found or insufficient permissions" },
        { status: 404 }
      );
    }

    const team = await loadTeamExecutionRuntimeContext(params.id, userId);
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    if (!isWorkflowTeam(team.config)) {
      return Response.json(
        { error: "Debug mode is only available for workflow teams" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { goal } = body as { goal?: string };

    // Starte Workflow im Debug-Modus (Hintergrund, pausiert zwischen Schritten)
    const executionPromise = executeWorkflow({
      teamId: params.id,
      userId,
      goal: goal || team.goal || "Debug Workflow Execution",
      debugMode: true,
    });

    // Warte kurz, damit die Execution-ID erstellt wird
    const result = await Promise.race([
      executionPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);

    if (result) {
      // Execution war schnell genug (z.B. nur Trigger-Node)
      return Response.json({
        executionId: result.executionId,
        status: result.status,
        debugMode: true,
      }, { status: 201 });
    }

    // Execution läuft im Hintergrund weiter
    waitUntil(executionPromise.catch((err) => {
      console.error("Debug workflow execution failed:", err);
    }));

    // Wir müssen die executionId aus dem Debug-State finden
    // Da executeWorkflow die DB schreibt, holen wir die neueste Execution
    const { prisma } = await import("@/lib/prisma");
    const latestExec = await prisma.teamExecution.findFirst({
      where: { teamId: params.id, userId },
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true },
    });

    if (!latestExec) {
      return Response.json({ error: "Execution not created" }, { status: 500 });
    }

    return Response.json({
      executionId: latestExec.id,
      status: latestExec.status,
      debugMode: true,
    }, { status: 201 });
  } catch (err) {
    console.error("POST /api/teams/[id]/execute-debug error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
