import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";
import { dbConnector } from "@/lib/data-pipeline/db-connector";

// GET: Alle Data-Connections des Users laden
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connections = await dbConnector.getConnections(userId);

    // Verschlüsselte Config nicht zurückgeben
    const safeConnections = connections.map((c) => ({
      id: c.id, name: c.name, type: c.type, status: c.status,
      writeEnabled: c.writeEnabled, lastUsedAt: c.lastUsedAt,
      createdAt: c.createdAt, updatedAt: c.updatedAt,
    }));

    return Response.json(safeConnections);
  } catch (err) {
    console.error("GET /api/data-pipeline/connections error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Neue Data-Connection erstellen (Test + Speichern)
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Plan-Check: Data Pipeline Feature verfügbar?
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const plan = (user?.plan || "FREE") as PlanType;
    const limits = PLAN_LIMITS[plan];

    if (!limits.dataPipeline) {
      return Response.json(
        { error: "Data Pipeline ist in deinem Plan nicht verfügbar. Upgrade auf Pro oder höher." },
        { status: 403 }
      );
    }

    // Maximale Anzahl an Connections prüfen
    const existingCount = await prisma.dataConnection.count({ where: { userId } });
    if (existingCount >= limits.maxDataConnections) {
      return Response.json(
        { error: `Maximale Anzahl an Data-Connections erreicht (${limits.maxDataConnections}).` },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { type, name, connectionString, host, port, database, username, password, ...extraConfig } = body;

    if (!type || !name) {
      return Response.json({ error: "Typ und Name sind erforderlich." }, { status: 400 });
    }

    // Connection-Config zusammenbauen
    const config = {
      type,
      name,
      connectionString,
      host,
      port,
      database,
      username,
      password,
      ...extraConfig,
    };

    // Verbindung testen und speichern
    const connection = await dbConnector.connect(userId, config);

    return Response.json(connection, { status: 201 });
  } catch (err) {
    console.error("POST /api/data-pipeline/connections error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
