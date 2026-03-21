import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  startWatchLearnSession,
  processWatchLearnSession,
  type ExtractedFrame,
} from "@/lib/sandbox/video-analyzer";

/**
 * POST /api/agents/[id]/watch-learn — Video hochladen oder Frames senden
 * Akzeptiert:
 * - multipart/form-data mit "video" (mp4/webm/mov, max 100MB)
 * - JSON mit { frames: ExtractedFrame[], taskDescription: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: agentId } = await params;

  // Agent prüfen
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
  });
  if (!agent) {
    return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
  }

  // Plan-Check: Pro+ erforderlich
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && !["PRO", "AGENCY", "ENTERPRISE"].includes(user.plan)) {
    return Response.json(
      { error: "Watch & Learn ist ab dem Pro-Plan verfügbar" },
      { status: 403 }
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Video-Upload
      const formData = await request.formData();
      const file = formData.get("video") as File | null;
      const taskDescription = formData.get("taskDescription") as string | null;

      if (!file) {
        return Response.json({ error: "Kein Video hochgeladen" }, { status: 400 });
      }

      // Dateigröße prüfen (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        return Response.json({ error: "Video zu groß (max 100MB)" }, { status: 400 });
      }

      // Typ prüfen
      const validTypes = ["video/mp4", "video/webm", "video/quicktime"];
      if (!validTypes.includes(file.type)) {
        return Response.json({ error: "Ungültiges Format. Erlaubt: mp4, webm, mov" }, { status: 400 });
      }

      // Zu Supabase Storage hochladen
      const supabase = getSupabaseAdmin();
      const fileName = `watch-learn/${agentId}/${Date.now()}-${file.name}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("knowledge-files")
        .upload(fileName, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        return Response.json({ error: "Upload fehlgeschlagen" }, { status: 500 });
      }

      const { data: urlData } = supabase.storage
        .from("knowledge-files")
        .getPublicUrl(fileName);

      const videoUrl = urlData.publicUrl;

      // Session starten
      const sessionId = await startWatchLearnSession(
        agentId,
        userId,
        videoUrl,
        taskDescription || undefined,
      );

      // Info: Client muss Frames separat senden (da Server-seitige Extraktion komplex ist)
      return Response.json({
        sessionId,
        status: "awaiting_frames",
        message: "Video hochgeladen. Bitte Frames extrahieren und an /watch-learn/{sessionId} senden.",
        videoUrl,
      }, { status: 202 });
    }

    // JSON-Body: Frames direkt senden
    const body = await request.json() as {
      frames?: ExtractedFrame[];
      taskDescription?: string;
    };

    if (!body.frames || body.frames.length === 0) {
      return Response.json({ error: "Keine Frames übergeben" }, { status: 400 });
    }

    if (body.frames.length > 60) {
      return Response.json({ error: "Maximal 60 Frames erlaubt" }, { status: 400 });
    }

    // Session starten und direkt verarbeiten
    const sessionId = await startWatchLearnSession(
      agentId,
      userId,
      "frames-direct",
      body.taskDescription,
    );

    // Async verarbeiten
    processWatchLearnSession(sessionId, body.frames).catch((err) => {
      console.error("[WatchLearn] Processing error:", err);
    });

    return Response.json({
      sessionId,
      status: "processing",
    }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/agents/[id]/watch-learn — Liste aller Sessions
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: agentId } = await params;

  const sessions = await prisma.watchLearnSession.findMany({
    where: { agentId, userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      taskDescription: true,
      frameCount: true,
      framesAnalyzed: true,
      proceduralMemoryId: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  return Response.json({ sessions });
}
