import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/agents/[id]/used-in-workflows
 *
 * Returns the workflows (AgentTeams) that reference this agent — either
 * as a primary member (agentId match) or as the fallback agent
 * (fallbackAgentId match). Used by the agent detail page to surface a
 * "Used in N workflows" badge so operators can navigate from the agent
 * back to the workflows that depend on it.
 *
 * Org-scoped both ways: caller must own the agent, and only workflows
 * the caller owns are returned. Caller cannot probe sub-org or
 * cross-org references with this endpoint.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let scope;
  try {
    scope = await requireOrgId();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  // Confirm the agent is in scope. We don't return the agent itself —
  // just enforce that the caller owns it.
  const agent = await prisma.agent.findFirst({
    where: { id, ...orgScopeFilter(scope) },
    select: { id: true },
  });
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  // Workflows in scope that have a member referencing this agent.
  const workflows = await prisma.agentTeam.findMany({
    where: {
      ...orgScopeFilter(scope),
      members: {
        some: {
          OR: [{ agentId: id }, { fallbackAgentId: id }],
        },
      },
    },
    select: {
      id: true,
      name: true,
      status: true,
      members: {
        where: {
          OR: [{ agentId: id }, { fallbackAgentId: id }],
        },
        select: { id: true, agentId: true, fallbackAgentId: true, role: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return Response.json({
    count: workflows.length,
    workflows: workflows.map((wf) => ({
      id: wf.id,
      name: wf.name,
      status: wf.status,
      // True when this agent is the primary in at least one member of the
      // workflow; false means it's only a fallback. Drives copy on the
      // detail page ("Used in" vs. "Fallback for").
      isPrimary: wf.members.some((m) => m.agentId === id),
    })),
  });
}
