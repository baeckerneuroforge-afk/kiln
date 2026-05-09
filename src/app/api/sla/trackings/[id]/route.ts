import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const tracking = await prisma.slaTracking.findFirst({
      where: { id: params.id, orgId: scope.orgId },
      include: {
        slaPolicy: true,
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!tracking) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(tracking);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[sla/trackings/:id] get failed", error);
    return Response.json({ error: "Failed to load tracking" }, { status: 500 });
  }
}
