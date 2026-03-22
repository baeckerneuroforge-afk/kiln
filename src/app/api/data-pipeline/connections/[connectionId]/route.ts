import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { dbConnector } from "@/lib/data-pipeline/db-connector";

// GET: Connection-Details + gecachtes Schema laden
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
    const connection = await dbConnector.getConnection(connectionId, userId);

    if (!connection) {
      return Response.json({ error: "Connection nicht gefunden" }, { status: 404 });
    }

    // Verschlüsselte Config nicht zurückgeben
    return Response.json(connection);
  } catch (err) {
    console.error("GET /api/data-pipeline/connections/[id] error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// PUT: Connection-Config aktualisieren (neu testen + verschlüsselt speichern)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { connectionId } = await params;

    // Prüfen ob Connection existiert und dem User gehört
    const existing = await prisma.dataConnection.findFirst({
      where: { id: connectionId, userId },
    });
    if (!existing) {
      return Response.json({ error: "Connection nicht gefunden" }, { status: 404 });
    }

    const body = await request.json();
    const { type, name, connectionString, host, port, database, username, password, ...extraConfig } = body;

    // Neue Config zusammenbauen
    const config = {
      type: type || existing.type,
      name: name || existing.name,
      connectionString,
      host,
      port,
      database,
      username,
      password,
      ...extraConfig,
    };

    // Verbindung neu testen
    const testResult = await dbConnector.testConnection(config);
    if (!testResult.success) {
      return Response.json({ error: `Verbindungstest fehlgeschlagen: ${testResult.error}` }, { status: 400 });
    }

    // Config verschluesseln und speichern
    const { encrypt } = await import("@/lib/encryption");
    const encryptedConfig = encrypt(JSON.stringify(config));

    const updated = await prisma.dataConnection.update({
      where: { id: connectionId },
      data: {
        name: config.name,
        type: config.type,
        encryptedConfig,
        status: "connected",
      },
    });

    return Response.json({
      id: updated.id,
      name: updated.name,
      type: updated.type,
      status: updated.status,
      writeEnabled: updated.writeEnabled,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error("PUT /api/data-pipeline/connections/[id] error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Connection entfernen
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { connectionId } = await params;

    // Prüfen ob Connection existiert und dem User gehört
    const existing = await prisma.dataConnection.findFirst({
      where: { id: connectionId, userId },
    });
    if (!existing) {
      return Response.json({ error: "Connection nicht gefunden" }, { status: 404 });
    }

    // Verbindung trennen und aus DB löschen
    await dbConnector.disconnect(connectionId, userId);
    await prisma.dataConnection.delete({ where: { id: connectionId } });

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/data-pipeline/connections/[id] error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
