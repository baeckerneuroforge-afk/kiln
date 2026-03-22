import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { dbConnector } from "@/lib/data-pipeline/db-connector";
import { queryBuilder } from "@/lib/data-pipeline/query-builder";

// POST: Query ausführen (SQL oder Natural Language)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  // Variablen für Fehler-Logging vorab deklarieren
  let resolvedConnectionId: string | undefined;
  let resolvedUserId: string | undefined;
  let queryMode: string | undefined;
  let originalQuery: string | undefined;

  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    resolvedUserId = userId;

    const { connectionId } = await params;
    resolvedConnectionId = connectionId;

    // Prüfen ob Connection existiert und dem User gehört
    const connection = await prisma.dataConnection.findFirst({
      where: { id: connectionId, userId },
    });
    if (!connection) {
      return Response.json({ error: "Connection nicht gefunden" }, { status: 404 });
    }

    const body = await request.json();
    const { query, mode } = body as { query: string; mode: "sql" | "natural_language" };
    queryMode = mode;
    originalQuery = query;

    if (!query || !mode) {
      return Response.json({ error: "Query und Mode sind erforderlich." }, { status: 400 });
    }

    if (mode !== "sql" && mode !== "natural_language") {
      return Response.json({ error: "Mode muss 'sql' oder 'natural_language' sein." }, { status: 400 });
    }

    let sqlToExecute = query;
    let generatedSql: string | undefined;
    let explanation: string | undefined;

    // Bei Natural Language: SQL generieren lassen
    if (mode === "natural_language") {
      const schema = await dbConnector.getSchema(connectionId, userId);
      const dbType = connection.type as "postgresql" | "mysql" | "sqlite";
      const built = await queryBuilder.buildQuery(schema, query, dbType);
      generatedSql = built.sql;
      explanation = built.explanation;
      sqlToExecute = built.sql;
    }

    // Query ausführen
    const startTime = Date.now();
    const result = await dbConnector.executeQuery(connectionId, userId, sqlToExecute);
    const executionTimeMs = Date.now() - startTime;

    // Query-Log speichern
    await prisma.dataQueryLog.create({
      data: {
        dataConnectionId: connectionId,
        userId,
        queryMode: mode,
        originalQuery: query,
        generatedSql: generatedSql || null,
        rowCount: result.rows?.length || 0,
        executionTimeMs,
        status: "success",
      },
    });

    return Response.json({
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rows?.length || 0,
      executionTimeMs,
      ...(generatedSql ? { generatedSql, explanation } : {}),
    });
  } catch (err) {
    console.error("POST /api/data-pipeline/connections/[id]/query error:", err);

    // Fehler-Log speichern (nur wenn genug Kontext vorhanden)
    if (resolvedUserId && resolvedConnectionId) {
      try {
        await prisma.dataQueryLog.create({
          data: {
            dataConnectionId: resolvedConnectionId,
            userId: resolvedUserId,
            queryMode: queryMode || "sql",
            originalQuery: originalQuery || "",
            status: "error",
            error: err instanceof Error ? err.message : "Unbekannter Fehler",
          },
        });
      } catch {
        // Log-Fehler nicht weiterwerfen
      }
    }

    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
