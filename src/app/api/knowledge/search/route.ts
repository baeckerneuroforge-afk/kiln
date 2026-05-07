/**
 * GET /api/knowledge/search?q=... — text-search across every
 * KnowledgeBase entry visible to the caller. Powers the search box
 * on /dashboard/knowledge?tab=bases.
 *
 * Pure ILIKE search on `sourceName` and the head of `content` — no
 * vector embedding lookup. The pgvector path lives behind the agent
 * RAG flow; this hub search is intentionally cheap so it can fire on
 * every keystroke without embedding API calls.
 *
 * Returns a flat list of document hits with the parent agent inlined,
 * snippet (first ~140 chars of content), and a navigation hint.
 */
import { prisma } from "@/lib/prisma";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { requireOrgId, OrgContextError } from "@/lib/auth/org-context";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;
const SNIPPET_LEN = 140;

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, rawLimit))
    : 20;

  if (q.length < 2) {
    return Response.json({ items: [], q });
  }

  const matches = await prisma.knowledgeBase.findMany({
    where: {
      ...orgScopeFilter(scope),
      agentId: { not: null },
      OR: [
        { sourceName: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      type: true,
      sourceName: true,
      content: true,
      createdAt: true,
      agentId: true,
      agent: { select: { id: true, name: true, slug: true } },
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  const items = matches.flatMap((m) => {
    if (!m.agentId || !m.agent) return [];
    const lc = (m.content ?? "").toLowerCase();
    const idx = lc.indexOf(q.toLowerCase());
    const start = idx >= 0 ? Math.max(0, idx - 30) : 0;
    const snippetRaw = (m.content ?? "").slice(start, start + SNIPPET_LEN);
    const snippet =
      (start > 0 ? "…" : "") +
      snippetRaw +
      ((m.content ?? "").length > start + SNIPPET_LEN ? "…" : "");
    return [
      {
        id: m.id,
        type: m.type,
        sourceName: m.sourceName,
        snippet,
        createdAt: m.createdAt.toISOString(),
        agentId: m.agentId,
        agentName: m.agent.name,
        agentSlug: m.agent.slug,
        href: `/dashboard/agents/${m.agentId}?tab=knowledge`,
      },
    ];
  });

  return Response.json({ items, q });
}
