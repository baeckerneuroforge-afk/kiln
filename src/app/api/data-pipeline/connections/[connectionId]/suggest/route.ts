import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { dbConnector } from "@/lib/data-pipeline/db-connector";
import { queryBuilder } from "@/lib/data-pipeline/query-builder";

// GET: KI-generierte Frage-Vorschläge basierend auf dem Schema
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { connectionId } = await params;

    // Schema laden
    const schema = await dbConnector.getSchema(connectionId, userId);

    // KI-Vorschläge generieren
    const questions = await queryBuilder.suggestQuestions(schema);

    return Response.json({ questions });
  } catch (err) {
    console.error("GET /api/data-pipeline/connections/[id]/suggest error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
