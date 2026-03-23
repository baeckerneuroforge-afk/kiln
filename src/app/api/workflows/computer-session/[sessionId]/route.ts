import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBrowserSession, closeBrowserSession } from "@/lib/browser-service";

/**
 * GET /api/workflows/computer-session/[sessionId] — Session-Status abrufen
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const session = getBrowserSession(sessionId);

  if (!session) {
    return Response.json({ error: "Session nicht gefunden" }, { status: 404 });
  }

  return Response.json({
    id: session.id,
    status: session.status,
    createdAt: session.createdAt,
    screenshotCount: session.screenshots.length,
    latestScreenshot: session.screenshots.length > 0
      ? session.screenshots[session.screenshots.length - 1]
      : null,
    actionLog: session.actionLog.slice(-20), // Letzte 20 Aktionen
    actionCount: session.actionLog.length,
  });
}

/**
 * POST /api/workflows/computer-session/[sessionId] — Session-Aktion ausführen
 * Body: { action: "pause" | "resume" | "abort" | "close" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const body = await request.json() as { action: string };

  const session = getBrowserSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session nicht gefunden" }, { status: 404 });
  }

  switch (body.action) {
    case "close":
    case "abort":
      await closeBrowserSession(sessionId);
      return Response.json({ success: true, status: "closed" });

    case "pause":
      session.status = "closed"; // Simplified: pause = close for now
      return Response.json({ success: true, status: "paused" });

    default:
      return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
  }
}
