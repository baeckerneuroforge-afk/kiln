/**
 * GET /api/agency/sub-orgs/[id]/activity — paginated audit-log feed
 * for a sub-org. Backs both the Overview tab's recent-activity
 * preview (limit=10) and the full Activity tab (limit up to 100).
 *
 * Filters supported via query string:
 *   - limit: number (clamped 1..100, default 50)
 *   - cursor: AuditEvent id for keyset pagination
 *   - category: comma-separated list of categories to keep
 *
 * Auth: see @/lib/agency/sub-org-auth.
 */
import { prisma } from "@/lib/prisma";
import { requireSubOrgAccess } from "@/lib/agency/sub-org-auth";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const access = await requireSubOrgAccess(params.id);
  if (!access.ok) return access.response;
  const orgId = access.relationship.childOrgId;

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, rawLimit))
    : DEFAULT_LIMIT;
  const cursor = url.searchParams.get("cursor") || undefined;
  const categoriesParam = url.searchParams.get("category");
  const categories = categoriesParam
    ? categoriesParam.split(",").map((c) => c.trim()).filter(Boolean)
    : null;

  const events = await prisma.auditEvent.findMany({
    where: {
      orgId,
      ...(categories && categories.length > 0
        ? { category: { in: categories } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1, // pull one extra to detect "has more"
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      category: true,
      action: true,
      resourceId: true,
      resourceType: true,
      severity: true,
      createdAt: true,
      details: true,
    },
  });

  const hasMore = events.length > limit;
  const items = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return Response.json({
    items: items.map((e) => ({
      id: e.id,
      userId: e.userId,
      category: e.category,
      action: e.action,
      resourceId: e.resourceId,
      resourceType: e.resourceType,
      severity: e.severity,
      createdAt: e.createdAt.toISOString(),
      details: e.details,
    })),
    nextCursor,
  });
}
