import { prisma } from "@/lib/prisma";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";

// Returns a small set of dashboard-home stats: month-to-date conversation
// count, lead count, and lifetime estimated value.
//
// Org-scoping resolves agents first (same query shape as GET /api/agents)
// and then counts conversations / aggregates analytics by `agentId IN
// (...)`. The earlier `agent: orgScopeFilter(scope)` form went through a
// Prisma to-one relation filter with an embedded `OR` — that pattern wasn't
// matching legacy rows reliably, so the dashboard saw zeros for accounts
// where /api/agents itself returned the correct count. Doing the two
// queries explicitly mirrors /api/agents and removes the indirection.
export async function GET() {
  let scope;
  try {
    scope = await requireOrgId();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const agents = await prisma.agent.findMany({
      where: orgScopeFilter(scope),
      select: { id: true },
    });
    const agentIds = agents.map((a) => a.id);

    if (agentIds.length === 0) {
      return Response.json({
        conversations: 0,
        leads: 0,
        estimatedValue: 0,
      });
    }

    const [conversations, leads, analytics] = await Promise.all([
      prisma.conversation.count({
        where: {
          agentId: { in: agentIds },
          createdAt: { gte: startOfMonth },
        },
      }),
      prisma.conversation.count({
        where: {
          agentId: { in: agentIds },
          createdAt: { gte: startOfMonth },
          visitorEmail: { not: null },
        },
      }),
      prisma.agentAnalytics.aggregate({
        where: { agentId: { in: agentIds } },
        _sum: { estimatedValue: true },
      }),
    ]);

    return Response.json({
      conversations,
      leads,
      estimatedValue: analytics._sum.estimatedValue ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
