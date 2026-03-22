import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { mcpConnectionManager } from "@/lib/mcp/mcp-connection-manager";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";

/**
 * GET /api/agents/[id]/mcp — Alle MCP-Verbindungen eines Agents
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: agentId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const connections = await mcpConnectionManager.getConnections(agentId);
  return Response.json({ connections });
}

/**
 * POST /api/agents/[id]/mcp — Neue MCP-Verbindung hinzufügen
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: agentId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  // Plan-Check
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const plan = (user?.plan || "FREE") as PlanType;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;

  if (limits.maxMCPConnections === 0) {
    return Response.json(
      { error: "MCP connections require a Starter plan or higher" },
      { status: 403 },
    );
  }

  // Limit prüfen
  const currentCount = await prisma.mCPConnection.count({ where: { agentId } });
  if (currentCount >= limits.maxMCPConnections) {
    return Response.json(
      { error: `You have reached your MCP connection limit (${limits.maxMCPConnections}). Upgrade your plan to add more.` },
      { status: 403 },
    );
  }

  try {
    const body = await request.json() as {
      name?: string;
      serverUrl?: string;
      transport?: string;
      authType?: string;
      authValue?: string;
    };

    if (!body.name || !body.serverUrl) {
      return Response.json({ error: "name and serverUrl are required" }, { status: 400 });
    }

    const result = await mcpConnectionManager.addConnection(agentId, {
      name: body.name,
      serverUrl: body.serverUrl,
      transport: (body.transport || "sse") as "sse" | "streamable_http",
      authType: (body.authType || "none") as "none" | "api_key" | "oauth",
      authValue: body.authValue,
    });

    return Response.json({
      id: result.id,
      tools: result.tools,
      toolCount: result.tools.length,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add connection";
    return Response.json({ error: message }, { status: 400 });
  }
}
