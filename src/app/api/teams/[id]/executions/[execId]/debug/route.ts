import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDebugState, setDebugAction } from "@/lib/services/workflow-runtime";

// GET: Aktuellen Debug-State abrufen
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; execId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const state = getDebugState(params.execId);
    if (!state) {
      return Response.json({ error: "No debug session found" }, { status: 404 });
    }

    return Response.json(state);
  } catch (err) {
    console.error("GET /api/teams/[id]/executions/[execId]/debug error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

// POST: Debug-Aktion senden (continue, skip, abort)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; execId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body as { action?: string };

    if (!action || !["continue", "skip", "abort"].includes(action)) {
      return Response.json(
        { error: "action must be 'continue', 'skip', or 'abort'" },
        { status: 400 }
      );
    }

    const success = setDebugAction(
      params.execId,
      action as "continue" | "skip" | "abort"
    );

    if (!success) {
      return Response.json(
        { error: "Debug session not found or not paused" },
        { status: 404 }
      );
    }

    return Response.json({ ok: true, action });
  } catch (err) {
    console.error("POST /api/teams/[id]/executions/[execId]/debug error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
