/**
 * GET /api/knowledge/bases — aggregated view of every agent's knowledge
 * collection in the active org. Backs the new top-level
 * /dashboard/knowledge?tab=bases hub.
 *
 * One row per agent that has at least one KnowledgeBase entry. The
 * `sizeBytes` field is approximated from the sum of `content.length`
 * — fine for the hub stats card; an exact byte count would need a
 * separate column on the model.
 *
 * `agentsUsingKnowledge` is the same as `bases.length` for now —
 * sharing isn't modeled yet, so each agent's collection is private.
 */
import { prisma } from "@/lib/prisma";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { requireOrgId, OrgContextError } from "@/lib/auth/org-context";

export const dynamic = "force-dynamic";

export async function GET() {
  let scope;
  try {
    scope = await requireOrgId();
  } catch (err) {
    // requireOrgId throws plain Error("Unauthenticated") for missing
    // userId and OrgContextError for missing personal org — both map
    // to 401 here (the operator needs to sign in or pick an org).
    if (err instanceof OrgContextError || err instanceof Error) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  // Pull every KB entry visible to the caller, joining only the parent
  // agent metadata we need to render the list. Bound to a sane upper
  // limit; if a workspace ever pushes past this, the hub stays usable
  // even if the list truncates.
  const entries = await prisma.knowledgeBase.findMany({
    where: { ...orgScopeFilter(scope), agentId: { not: null } },
    select: {
      agentId: true,
      content: true,
      sourceName: true,
      type: true,
      createdAt: true,
      agent: { select: { id: true, name: true, slug: true } },
    },
    take: 5000,
    orderBy: { createdAt: "desc" },
  });

  type Bucket = {
    agentId: string;
    agentName: string;
    agentSlug: string;
    documentCount: number;
    sizeBytes: number;
    updatedAt: string;
    types: Set<string>;
  };
  const byAgent = new Map<string, Bucket>();
  for (const e of entries) {
    if (!e.agentId || !e.agent) continue;
    const cur = byAgent.get(e.agentId);
    const size = (e.content ?? "").length;
    const ts = e.createdAt.toISOString();
    if (cur) {
      cur.documentCount += 1;
      cur.sizeBytes += size;
      if (ts > cur.updatedAt) cur.updatedAt = ts;
      cur.types.add(e.type);
    } else {
      byAgent.set(e.agentId, {
        agentId: e.agentId,
        agentName: e.agent.name,
        agentSlug: e.agent.slug,
        documentCount: 1,
        sizeBytes: size,
        updatedAt: ts,
        types: new Set([e.type]),
      });
    }
  }

  const bases = [...byAgent.values()]
    .map((b) => ({
      agentId: b.agentId,
      agentName: b.agentName,
      agentSlug: b.agentSlug,
      documentCount: b.documentCount,
      sizeBytes: b.sizeBytes,
      updatedAt: b.updatedAt,
      types: [...b.types],
      sharedWith: [] as string[], // sharing not modeled — see file header
    }))
    .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));

  const totalDocuments = bases.reduce((acc, b) => acc + b.documentCount, 0);
  const totalSizeBytes = bases.reduce((acc, b) => acc + b.sizeBytes, 0);

  return Response.json({
    totalBases: bases.length,
    totalDocuments,
    totalSizeBytes,
    agentsUsingKnowledge: bases.length,
    bases,
  });
}
