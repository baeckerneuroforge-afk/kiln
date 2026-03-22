import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { mcpConnectionManager } from "@/lib/mcp/mcp-connection-manager";

type RouteParams = { params: Promise<{ id: string; connectionId: string }> };

/**
 * GET /api/agents/[id]/mcp/[connectionId] — Verbindungsdetails + Tool-Liste
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: agentId, connectionId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const conn = await prisma.mCPConnection.findFirst({
    where: { id: connectionId, agentId },
  });
  if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });

  return Response.json({
    id: conn.id,
    name: conn.name,
    serverUrl: conn.serverUrl,
    transport: conn.transport,
    authType: conn.authType,
    status: conn.status,
    discoveredTools: conn.discoveredTools || [],
    enabledTools: conn.enabledTools || [],
    lastTestedAt: conn.lastTestedAt,
    lastUsedAt: conn.lastUsedAt,
    lastError: conn.lastError,
  });
}

/**
 * PUT /api/agents/[id]/mcp/[connectionId] — Auth aktualisieren, Tools togglen
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: agentId, connectionId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const conn = await prisma.mCPConnection.findFirst({ where: { id: connectionId, agentId } });
  if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });

  const body = await request.json() as {
    enabledTools?: string[];
  };

  if (body.enabledTools) {
    await mcpConnectionManager.updateEnabledTools(connectionId, body.enabledTools);
  }

  return Response.json({ success: true });
}

/**
 * DELETE /api/agents/[id]/mcp/[connectionId] — Verbindung entfernen
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: agentId, connectionId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  await mcpConnectionManager.removeConnection(agentId, connectionId);
  return Response.json({ success: true });
}

/**
 * POST /api/agents/[id]/mcp/[connectionId] — Test connectivity
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: agentId, connectionId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const result = await mcpConnectionManager.refreshConnection(connectionId);
  return Response.json(result);
}
