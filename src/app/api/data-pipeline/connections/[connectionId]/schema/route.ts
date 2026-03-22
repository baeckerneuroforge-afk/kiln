import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { dbConnector } from "@/lib/data-pipeline/db-connector";

// GET: Vollständiges Datenbank-Schema laden
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
    const schema = await dbConnector.getSchema(connectionId, userId);

    return Response.json({ tables: schema });
  } catch (err) {
    console.error("GET /api/data-pipeline/connections/[id]/schema error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
