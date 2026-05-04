import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/portal/analytics — Cross-Client Analytics
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const range = request.nextUrl.searchParams.get("range") || "30d";
    const clientFilter = request.nextUrl.searchParams.get("clients");

    // Zeitraum berechnen
    const days = range === "7d" ? 7 : range === "90d" ? 90 : range === "365d" ? 365 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Portale laden
    const portals = await prisma.clientPortal.findMany({
      where: {
        userId,
        isActive: true,
        ...(clientFilter
          ? { id: { in: clientFilter.split(",") } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        clientName: true,
        clientEmail: true,
        agentIds: true,
      },
    });

    // Alle Agent IDs sammeln
    const allAgentIds = portals.flatMap((p) => (p.agentIds as string[]) || []);

    // Agents mit Analytics laden
    const agents = await prisma.agent.findMany({
      where: { id: { in: allAgentIds }, userId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            conversations: { where: { createdAt: { gte: since } } },
            runs: { where: { createdAt: { gte: since } } },
          },
        },
      },
    });

    // Cost Records laden
    const costRecords = await prisma.costRecord.findMany({
      where: {
        agentId: { in: allAgentIds },
        timestamp: { gte: since },
      },
      select: {
        agentId: true,
        costCents: true,
      },
    });

    const agentMap = new Map(agents.map((a) => [a.id, a]));
    const agentCosts = new Map<string, number>();
    for (const record of costRecords) {
      agentCosts.set(
        record.agentId,
        (agentCosts.get(record.agentId) || 0) + record.costCents
      );
    }

    // Analytics pro Client berechnen
    const clients = portals.map((portal) => {
      const portalAgentIds = (portal.agentIds as string[]) || [];
      const portalAgents = portalAgentIds.map((id) => agentMap.get(id)).filter(Boolean);

      const runs = portalAgents.reduce(
        (sum, a) => sum + (a?._count.runs || 0),
        0
      );
      const conversations = portalAgents.reduce(
        (sum, a) => sum + (a?._count.conversations || 0),
        0
      );
      const costCents = portalAgentIds.reduce(
        (sum, id) => sum + (agentCosts.get(id) || 0),
        0
      );
      const avgHealthScore = portalAgents.length > 0
        ? Math.round(
            portalAgents.reduce(
              (sum, a) =>
                sum + Math.min(100, Math.round(((a?._count.conversations || 0) / 10) * 100)),
              0
            ) / portalAgents.length
          )
        : 0;

      return {
        clientId: portal.id,
        clientName: portal.clientName || portal.name,
        revenue: 0, // Platzhalter — aus Billing berechnen
        agentCount: portalAgents.length,
        runs,
        conversations,
        costCents,
        avgHealthScore: Math.min(avgHealthScore, 100),
      };
    });

    const totals = {
      revenue: clients.reduce((sum, c) => sum + c.revenue, 0),
      runs: clients.reduce((sum, c) => sum + c.runs, 0),
      conversations: clients.reduce((sum, c) => sum + c.conversations, 0),
      costCents: clients.reduce((sum, c) => sum + c.costCents, 0),
      avgHealthScore:
        clients.length > 0
          ? Math.round(clients.reduce((sum, c) => sum + c.avgHealthScore, 0) / clients.length)
          : 0,
    };

    return Response.json({ clients, totals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
