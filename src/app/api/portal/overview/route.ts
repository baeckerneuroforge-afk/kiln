import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/portal/overview — Aggregierte Kunden-Übersicht
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    // Alle Client-Portale des Users laden
    const portals = await prisma.clientPortal.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        clientEmail: true,
        clientName: true,
        agentIds: true,
        lastAccessedAt: true,
      },
    });

    // Alle Agents des Users laden
    const agents = await prisma.agent.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        status: true,
        _count: {
          select: {
            conversations: true,
            runs: true,
          },
        },
      },
    });

    const agentMap = new Map(agents.map((a) => [a.id, a]));

    // Clients zusammenbauen
    const clients = portals.map((portal) => {
      const portalAgentIds = (portal.agentIds as string[]) || [];
      const portalAgents = portalAgentIds
        .map((id) => agentMap.get(id))
        .filter(Boolean);

      const totalRuns = portalAgents.reduce(
        (sum, a) => sum + (a?._count.runs || 0),
        0
      );
      const totalConversations = portalAgents.reduce(
        (sum, a) => sum + (a?._count.conversations || 0),
        0
      );

      // Health Score berechnen (basierend auf Aktivität)
      const healthScore = portalAgents.length > 0
        ? Math.min(100, Math.round((totalConversations / (portalAgents.length * 10)) * 100))
        : 0;

      return {
        id: portal.id,
        name: portal.clientName || portal.name,
        email: portal.clientEmail,
        agentCount: portalAgents.length,
        totalRuns,
        healthScore: Math.min(healthScore, 100),
        revenue: 0, // Wird aus Billing berechnet, hier Platzhalter
        lastActive: portal.lastAccessedAt?.toISOString() || new Date().toISOString(),
        agents: portalAgents.map((a) => ({
          id: a!.id,
          name: a!.name,
          status: a!.status,
          conversations: a!._count.conversations,
          healthScore: Math.min(
            100,
            Math.round((a!._count.conversations / 10) * 100)
          ),
        })),
      };
    });

    // Overview berechnen
    const overview = {
      totalClients: clients.length,
      totalAgents: clients.reduce((sum, c) => sum + c.agentCount, 0),
      totalRuns: clients.reduce((sum, c) => sum + c.totalRuns, 0),
      totalRevenue: clients.reduce((sum, c) => sum + c.revenue, 0),
      healthDistribution: {
        healthy: clients.filter((c) => c.healthScore >= 80).length,
        degraded: clients.filter((c) => c.healthScore >= 50 && c.healthScore < 80).length,
        critical: clients.filter((c) => c.healthScore < 50).length,
      },
    };

    return Response.json({ overview, clients });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
