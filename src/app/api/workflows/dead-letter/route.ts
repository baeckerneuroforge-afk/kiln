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
    const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));

    const where: Record<string, unknown> = {
      agentTeam: { orgId: scope.orgId },
    };
    if (status === "OPEN" || status === "RETRIED" || status === "DISCARDED") {
      where.status = status;
    }
    const [items, total] = await Promise.all([
      prisma.workflowDeadLetter.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { agentTeam: { select: { id: true, name: true } } },
      }),
      prisma.workflowDeadLetter.count({ where }),
    ]);
    return Response.json({ items, total });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[workflows/dead-letter] list failed", error);
    return Response.json({ error: "Failed to list dead-letter items" }, { status: 500 });
  }
}
