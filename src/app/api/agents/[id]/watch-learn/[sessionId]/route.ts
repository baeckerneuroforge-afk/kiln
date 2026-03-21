import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  processWatchLearnSession,
  type ExtractedFrame,
} from "@/lib/sandbox/video-analyzer";

/**
 * GET /api/agents/[id]/watch-learn/[sessionId] — Session-Status + Details
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;

  const session = await prisma.watchLearnSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) {
    return Response.json({ error: "Session nicht gefunden" }, { status: 404 });
  }

  return Response.json({
    id: session.id,
    agentId: session.agentId,
    status: session.status,
    taskDescription: session.taskDescription,
    frameCount: session.frameCount,
    framesAnalyzed: session.framesAnalyzed,
    extractedSteps: session.extractedSteps,
    generatedProcedure: session.generatedProcedure,
    proceduralMemoryId: session.proceduralMemoryId,
    errorMessage: session.errorMessage,
    createdAt: session.createdAt,
    progress: session.frameCount > 0
      ? Math.round((session.framesAnalyzed / session.frameCount) * 100)
      : 0,
  });
}

/**
 * POST /api/agents/[id]/watch-learn/[sessionId] — Frames nachliefern
 * Für den Fall dass das Video serverseitig hochgeladen wurde
 * und Frames clientseitig extrahiert werden.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;

  const session = await prisma.watchLearnSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) {
    return Response.json({ error: "Session nicht gefunden" }, { status: 404 });
  }

  if (!["UPLOADING", "EXTRACTING", "awaiting_frames"].includes(session.status)) {
    return Response.json({ error: "Session wird bereits verarbeitet" }, { status: 409 });
  }

  try {
    const body = await request.json() as {
      frames?: ExtractedFrame[];
      taskDescription?: string;
    };

    if (!body.frames || body.frames.length === 0) {
      return Response.json({ error: "Keine Frames übergeben" }, { status: 400 });
    }

    // Task-Description aktualisieren falls mitgesendet
    if (body.taskDescription) {
      await prisma.watchLearnSession.update({
        where: { id: sessionId },
        data: { taskDescription: body.taskDescription },
      });
    }

    // Async verarbeiten
    processWatchLearnSession(sessionId, body.frames).catch((err) => {
      console.error("[WatchLearn] Processing error:", err);
    });

    return Response.json({ status: "processing" }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/agents/[id]/watch-learn/[sessionId] — Session löschen
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;

  try {
    await prisma.watchLearnSession.deleteMany({
      where: { id: sessionId, userId },
    });
    return Response.json({ deleted: true });
  } catch {
    return Response.json({ error: "Löschen fehlgeschlagen" }, { status: 500 });
  }
}
