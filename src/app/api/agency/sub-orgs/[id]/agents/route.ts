/**
 * GET /api/agency/sub-orgs/[id]/agents — agents owned by the sub-org.
 *
 * Returned shape is intentionally lightweight — name, mode, status,
 * last-run timestamp, and conversation count. The detail page links
 * out to the existing /dashboard/agents/[id] route for full edits.
 *
 * Auth: see @/lib/agency/sub-org-auth.
 */
import { prisma } from "@/lib/prisma";
import { requireSubOrgAccess } from "@/lib/agency/sub-org-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await requireSubOrgAccess(params.id);
  if (!access.ok) return access.response;
  const orgId = access.relationship.childOrgId;

  const agents = await prisma.agent.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      slug: true,
      mode: true,
      status: true,
      llmModel: true,
      lastRunAt: true,
      updatedAt: true,
      _count: { select: { conversations: true } },
    },
  });

  return Response.json({
    items: agents.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      mode: a.mode,
      status: a.status,
      llmModel: a.llmModel,
      lastRunAt: a.lastRunAt?.toISOString() ?? null,
      updatedAt: a.updatedAt.toISOString(),
      conversationCount: a._count.conversations,
    })),
  });
}
