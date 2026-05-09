import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

const MAX_PAGE_SIZE = 200;

export async function GET(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const resourceType = url.searchParams.get("resourceType");
    const severity = url.searchParams.get("severity");
    const actorUserId = url.searchParams.get("actorUserId");
    const search = (url.searchParams.get("q") || "").trim();
    const since = url.searchParams.get("since");
    const until = url.searchParams.get("until");
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);

    const where: Record<string, unknown> = { orgId: scope.orgId };
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;
    if (severity) where.severity = severity;
    if (actorUserId) where.actorUserId = actorUserId;
    if (search) where.description = { contains: search, mode: "insensitive" };
    if (since || until) {
      const range: Record<string, Date> = {};
      if (since) range.gte = new Date(since);
      if (until) range.lte = new Date(until);
      where.createdAt = range;
    }

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return Response.json({ entries, total, page, limit });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[audit-log] list failed", error);
    return Response.json({ error: "Failed to list audit log" }, { status: 500 });
  }
}
