/**
 * Agent Workspace File API
 * GET: Datei herunterladen
 * DELETE: Datei löschen (soft-delete)
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { AgentWorkspace } from "@/lib/workspace/agent-workspace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: agentId, path: pathSegments } = await params;
    const filePath = pathSegments.join("/");

    // Ownership prüfen
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      select: { id: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    const workspace = new AgentWorkspace();
    const result = await workspace.getFile(agentId, filePath);

    if (!result) {
      return Response.json({ error: "Datei nicht gefunden" }, { status: 404 });
    }

    return new Response(new Uint8Array(result.content), {
      headers: {
        "Content-Type": result.file.mimeType,
        "Content-Disposition": `attachment; filename="${filePath.split("/").pop()}"`,
        "Content-Length": result.content.length.toString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: agentId, path: pathSegments } = await params;
    const filePath = pathSegments.join("/");

    // Ownership prüfen
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      select: { id: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    const workspace = new AgentWorkspace();
    await workspace.deleteFile(agentId, filePath);

    return Response.json({ deleted: true, path: filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
