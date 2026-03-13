import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET: Orchestration analytics — handoff stats
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all user's orchestration rules
    const rules = await prisma.agentOrchestration.findMany({
      where: { sourceAgent: { userId } },
      select: { id: true, sourceAgentId: true, targetAgentId: true },
    });

    const ruleIds = rules.map((r) => r.id);

    if (ruleIds.length === 0) {
      return Response.json({
        totalHandoffs: 0,
        handoffsLast30Days: 0,
        routes: [],
        dailyHandoffs: [],
        avgHandoffsPerConversation: 0,
      });
    }

    // Total handoffs
    const [totalHandoffs, handoffsLast30Days] = await Promise.all([
      prisma.orchestrationHandoff.count({
        where: { orchestrationRuleId: { in: ruleIds } },
      }),
      prisma.orchestrationHandoff.count({
        where: { orchestrationRuleId: { in: ruleIds }, createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    // Most active routes (top 10)
    const handoffsByRule = await prisma.orchestrationHandoff.groupBy({
      by: ["orchestrationRuleId"],
      where: { orchestrationRuleId: { in: ruleIds } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    // Enrich with agent names
    const enrichedRules = await prisma.agentOrchestration.findMany({
      where: { id: { in: handoffsByRule.map((h) => h.orchestrationRuleId) } },
      include: {
        sourceAgent: { select: { name: true } },
        targetAgent: { select: { name: true } },
      },
    });

    const ruleMap = new Map(enrichedRules.map((r) => [r.id, r]));
    const routes = handoffsByRule.map((h) => {
      const rule = ruleMap.get(h.orchestrationRuleId);
      return {
        ruleId: h.orchestrationRuleId,
        sourceName: rule?.sourceAgent.name || "Unknown",
        targetName: rule?.targetAgent.name || "Unknown",
        condition: rule?.condition || "",
        count: h._count.id,
      };
    });

    // Daily handoffs (last 30 days)
    const recentHandoffs = await prisma.orchestrationHandoff.findMany({
      where: { orchestrationRuleId: { in: ruleIds }, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const dailyMap = new Map<string, number>();
    for (let d = new Date(thirtyDaysAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
      dailyMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const h of recentHandoffs) {
      const day = h.createdAt.toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }
    const dailyHandoffs = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

    // Avg handoffs per conversation
    const uniqueConversations = await prisma.orchestrationHandoff.groupBy({
      by: ["conversationId"],
      where: { orchestrationRuleId: { in: ruleIds } },
    });

    const avgHandoffsPerConversation = uniqueConversations.length > 0
      ? Math.round((totalHandoffs / uniqueConversations.length) * 10) / 10
      : 0;

    return Response.json({
      totalHandoffs,
      handoffsLast30Days,
      routes,
      dailyHandoffs,
      avgHandoffsPerConversation,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
