import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { executeMCPTool } from "@/lib/mcp/mcp-tool-bridge";

type RouteParams = { params: Promise<{ id: string; connectionId: string; toolName: string }> };

/**
 * POST /api/agents/[id]/mcp/[connectionId]/tools/[toolName] — Tool manuell ausführen
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: agentId, connectionId, toolName } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  // Verbindung prüfen
  const conn = await prisma.mCPConnection.findFirst({
    where: { id: connectionId, agentId },
  });
  if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });

  try {
    const body = (await request.json()) as Record<string, unknown>;

    // Prefixed tool name konstruieren
    const serverPrefix = conn.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const prefixedName = `mcp__${serverPrefix}__${toolName}`;

    const result = await executeMCPTool(agentId, prefixedName, body);
    return Response.json(JSON.parse(result));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Tool execution failed" },
      { status: 500 },
    );
  }
}
