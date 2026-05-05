import { prisma } from "@/lib/prisma";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";

// Recent Activity feed for the dashboard home. Pulls the last few rows from
// three sources — conversations, agent runs, team executions — filters them
// to the active org (with the same legacy orgId-IS-NULL fallback used by
// every other Phase 2.2 endpoint), merges by timestamp, and returns the
// most recent N events in the shape the <RecentActivityFeed /> component
// already expects.

type ActivityType = "agent" | "workflow" | "conversation";

type ActivityEvent = {
  id: string;
  type: ActivityType;
  title: string;
  timestamp: string;
  href: string;
};

const PER_SOURCE_LIMIT = 10;
const RESPONSE_LIMIT = 10;

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
    const agentScope = orgScopeFilter(scope);
    const teamScope = orgScopeFilter(scope);

    const [conversations, runs, executions] = await Promise.all([
      prisma.conversation.findMany({
        where: { agent: agentScope },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE_LIMIT,
        select: {
          id: true,
          createdAt: true,
          visitorName: true,
          visitorEmail: true,
          agent: { select: { id: true, name: true } },
        },
      }),
      prisma.agentRun.findMany({
        where: { agent: agentScope },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE_LIMIT,
        select: {
          id: true,
          createdAt: true,
          status: true,
          agent: { select: { id: true, name: true } },
        },
      }),
      prisma.teamExecution.findMany({
        where: teamScope,
        orderBy: { startedAt: "desc" },
        take: PER_SOURCE_LIMIT,
        select: {
          id: true,
          startedAt: true,
          status: true,
          team: { select: { id: true, name: true } },
        },
      }),
    ]);

    const events: ActivityEvent[] = [
      ...conversations.map((c): ActivityEvent => {
        const visitor = c.visitorName || c.visitorEmail || "Anonymous";
        return {
          id: `c_${c.id}`,
          type: "conversation",
          title: `${visitor} chatted with ${c.agent.name}`,
          timestamp: c.createdAt.toISOString(),
          href: `/dashboard/conversations?agentId=${c.agent.id}`,
        };
      }),
      ...runs.map((r): ActivityEvent => {
        const verb = r.status === "ERROR" ? "failed" : "ran";
        return {
          id: `r_${r.id}`,
          type: "agent",
          title: `${r.agent.name} ${verb}`,
          timestamp: r.createdAt.toISOString(),
          href: `/dashboard/agents/${r.agent.id}`,
        };
      }),
      ...executions.map((e): ActivityEvent => ({
        id: `t_${e.id}`,
        type: "workflow",
        title: `${e.team.name} ${e.status === "FAILED" ? "failed" : "executed"}`,
        timestamp: e.startedAt.toISOString(),
        href: `/dashboard/teams/${e.team.id}`,
      })),
    ];

    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return Response.json({ events: events.slice(0, RESPONSE_LIMIT) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
