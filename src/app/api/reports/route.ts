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
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));

    const where: Record<string, unknown> = { orgId: scope.orgId };
    if (status) where.status = status;
    const [reports, total] = await Promise.all([
      prisma.customerReport.findMany({
        where,
        orderBy: { periodEnd: "desc" },
        take: limit,
        select: {
          id: true,
          periodType: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          recipientEmail: true,
          sentAt: true,
          createdAt: true,
        },
      }),
      prisma.customerReport.count({ where }),
    ]);
    return Response.json({ reports, total });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[reports] list failed", error);
    return Response.json({ error: "Failed to list reports" }, { status: 500 });
  }
}
