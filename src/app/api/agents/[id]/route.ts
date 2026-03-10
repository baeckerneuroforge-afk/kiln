import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// Agent-Details laden
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
      include: {
        actions: true,
        knowledgeBases: true,
        _count: { select: { conversations: true } },
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    return Response.json(agent);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server-Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Agent aktualisieren
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // Ownership prüfen
    const existing = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    const body = await request.json();
    const agent = await prisma.agent.update({
      where: { id: params.id },
      data: body,
    });

    return Response.json(agent);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server-Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Agent löschen
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const existing = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    await prisma.agent.delete({ where: { id: params.id } });
    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server-Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}
