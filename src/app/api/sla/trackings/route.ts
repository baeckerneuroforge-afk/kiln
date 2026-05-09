import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const departmentId = url.searchParams.get("departmentId");
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const where: Record<string, unknown> = { orgId: scope.orgId };
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    const trackings = await prisma.slaTracking.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { slaPolicy: { select: { id: true, name: true, firstResponseTargetMinutes: true } } },
    });
    return Response.json({ trackings });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[sla/trackings] list failed", error);
    return Response.json({ error: "Failed to list trackings" }, { status: 500 });
  }
}
