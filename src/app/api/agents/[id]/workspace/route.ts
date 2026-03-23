/**
 * Agent Workspace API
 * GET: Listet Workspace-Dateien
 * POST: Lädt Datei in den Workspace hoch
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { AgentWorkspace } from "@/lib/workspace/agent-workspace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: agentId } = await params;

    // Ownership prüfen
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      select: { id: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    const workspace = new AgentWorkspace();
    const files = await workspace.listFiles(agentId);
    const totalSize = await workspace.getWorkspaceSize(agentId);

    return Response.json({
      files,
      totalSizeBytes: totalSize,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: agentId } = await params;

    // Ownership prüfen
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      select: { id: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const path = formData.get("path") as string | null;

    if (!file || !path) {
      return Response.json(
        { error: "file und path sind erforderlich" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workspace = new AgentWorkspace();

    const result = await workspace.saveFile(
      agentId,
      userId,
      path,
      buffer,
      file.type || "application/octet-stream"
    );

    return Response.json({
      id: result.id,
      path: result.path,
      version: result.version,
      sizeBytes: result.sizeBytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message.includes("Limit") ? 402 : 500;
    return Response.json({ error: message }, { status });
  }
}
