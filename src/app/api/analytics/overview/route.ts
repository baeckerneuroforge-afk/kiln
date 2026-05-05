import { prisma } from "@/lib/prisma";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";

// Returns a small set of dashboard-home stats: month-to-date conversation
// count, lead count, and lifetime estimated value. Counts every conversation
// belonging to an agent in the active org plus any unmigrated user-owned
// agents (orgId IS NULL && userId === scope.userId), so the dashboard does
// not silently ignore agents created before the Phase 2.2 multi-tenancy
// rollout.
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

    const agentScope = orgScopeFilter(scope);

    const [conversations, leads, analytics] = await Promise.all([
      prisma.conversation.count({
        where: {
          agent: agentScope,
          createdAt: { gte: startOfMonth },
        },
      }),
      prisma.conversation.count({
        where: {
          agent: agentScope,
          createdAt: { gte: startOfMonth },
          visitorEmail: { not: null },
        },
      }),
      prisma.agentAnalytics.aggregate({
        where: { agent: agentScope },
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
