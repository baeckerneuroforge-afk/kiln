import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET: Alle Custom Tools eines Agents laden
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const tools = await prisma.agentCustomTool.findMany({
      where: { agentId: params.id },
      orderBy: { createdAt: "asc" },
    });

    return Response.json(tools);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Custom Tool erstellen oder aktualisieren
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const body = await request.json();
    const { id: toolId, name, description, method, url, headers, bodyTemplate, responseMapping, enabled } = body;

    if (!name || !description || !url) {
      return Response.json({ error: "Name, description, and URL are required" }, { status: 400 });
    }

    // Tool-Name in snake_case sanitizen
    const toolName = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

    if (toolId) {
      // Update
      const tool = await prisma.agentCustomTool.update({
        where: { id: toolId, agentId: params.id },
        data: {
          name: toolName,
          description,
          method: method || "GET",
          url,
          headers: headers || null,
          bodyTemplate: bodyTemplate || null,
          responseMapping: responseMapping || null,
          enabled: enabled !== false,
        },
      });
      return Response.json(tool);
    } else {
      // Create
      const tool = await prisma.agentCustomTool.create({
        data: {
          agentId: params.id,
          name: toolName,
          description,
          method: method || "GET",
          url,
          headers: headers || null,
          bodyTemplate: bodyTemplate || null,
          responseMapping: responseMapping || null,
        },
      });
      return Response.json(tool, { status: 201 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Custom Tool löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const { toolId } = await request.json();
    await prisma.agentCustomTool.delete({ where: { id: toolId, agentId: params.id } });

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
