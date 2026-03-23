/**
 * Workflow Resume API
 * Setzt eine Execution von einem Checkpoint fort.
 * Wird automatisch von der ExecutionQueue oder manuell aufgerufen.
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { loadCheckpoint } from "@/lib/execution-persistence";
import { TeamExecutionStatus } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { executionId, segment } = body as {
      executionId?: string;
      segment?: number;
    };

    if (!executionId) {
      return Response.json(
        { error: "executionId ist erforderlich" },
        { status: 400 }
      );
    }

    // Auth: entweder User-Auth oder internes Token
    const internalToken = request.headers.get("x-internal-token");
    const isInternal =
      internalToken && internalToken === process.env.INTERNAL_API_TOKEN;

    if (!isInternal) {
      const { userId } = await auth();
      if (!userId) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Verifiziere Ownership
      const execution = await prisma.teamExecution.findUnique({
        where: { id: executionId },
        select: { userId: true },
      });

      if (!execution || execution.userId !== userId) {
        return Response.json({ error: "Nicht gefunden" }, { status: 404 });
      }
    }

    // Checkpoint laden
    const checkpoint = await loadCheckpoint(executionId);
    if (!checkpoint) {
      return Response.json(
        { error: "Kein Checkpoint gefunden für diese Execution" },
        { status: 404 }
      );
    }

    if (checkpoint.pendingQueue.length === 0) {
      // Nichts mehr zu tun
      await prisma.teamExecution.update({
        where: { id: executionId },
        data: {
          status: TeamExecutionStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      return Response.json({
        status: "completed",
        executionId,
        message: "Execution bereits abgeschlossen — keine ausstehenden Nodes",
      });
    }

    // Status auf RUNNING setzen
    await prisma.teamExecution.update({
      where: { id: executionId },
      data: {
        status: TeamExecutionStatus.RUNNING,
        executionContext: JSON.parse(JSON.stringify({
          ...checkpoint.context,
          _resumeSegment: segment || 1,
          _resumedAt: new Date().toISOString(),
        })) as object,
      },
    });

    return Response.json({
      status: "resumed",
      executionId,
      segment: segment || 1,
      pendingNodes: checkpoint.pendingQueue.length,
      completedNodes: checkpoint.completedNodes,
      failedNodes: checkpoint.failedNodes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[Resume API]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
