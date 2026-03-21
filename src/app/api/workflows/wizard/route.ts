import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { analyzeDescription } from "@/lib/sandbox/computer-use-wizard";

/**
 * POST /api/workflows/wizard — Analysiert eine natürliche Sprachbeschreibung
 * und gibt einen Workflow-Vorschlag zurück.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as { description?: string; teamId?: string };

    if (!body.description || typeof body.description !== "string") {
      return Response.json({ error: "Beschreibung fehlt" }, { status: 400 });
    }

    const result = await analyzeDescription({
      description: body.description,
      teamId: body.teamId,
    });

    if (!result) {
      return Response.json(
        { error: "Analyse fehlgeschlagen — bitte versuche eine detailliertere Beschreibung" },
        { status: 422 }
      );
    }

    return Response.json(result);
  } catch {
    return Response.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
