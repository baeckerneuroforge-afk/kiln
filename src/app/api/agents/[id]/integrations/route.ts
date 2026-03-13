import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

// GET: All integrations for an agent (connected ones with enabled toggle)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    // Verify agent ownership
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    // Get all user connections with per-agent assignment status
    const connections = await prisma.integrationConnection.findMany({
      where: { userId, isActive: true },
      include: {
        agentIntegrations: {
          where: { agentId },
          select: { id: true, enabled: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const result = connections.map((conn) => ({
      id: conn.id,
      provider: conn.provider,
      name: conn.name,
      isCustom: conn.isCustom,
      assigned: conn.agentIntegrations.length > 0,
      enabled: conn.agentIntegrations[0]?.enabled ?? false,
      assignmentId: conn.agentIntegrations[0]?.id ?? null,
    }));

    return Response.json({ integrations: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Assign or toggle integration for an agent
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const { integrationId, enabled } = await req.json();
    if (!integrationId) return Response.json({ error: "Integration ID required" }, { status: 400 });

    // Verify ownership
    const [agent, integration] = await Promise.all([
      prisma.agent.findFirst({ where: { id: agentId, userId } }),
      prisma.integrationConnection.findFirst({ where: { id: integrationId, userId } }),
    ]);
    if (!agent || !integration) return Response.json({ error: "Not found" }, { status: 404 });

    // Upsert assignment
    const assignment = await prisma.agentIntegration.upsert({
      where: { agentId_integrationId: { agentId, integrationId } },
      create: { agentId, integrationId, enabled: enabled !== false },
      update: { enabled: enabled !== false },
    });

    return Response.json(assignment);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove integration assignment from agent
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const { integrationId } = await req.json();

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    await prisma.agentIntegration.deleteMany({
      where: { agentId, integrationId },
    });

    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
