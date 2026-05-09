import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { cancelTracking } from "@/lib/sla/tracker";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const tracking = await prisma.slaTracking.findFirst({
      where: { id: params.id, orgId: scope.orgId },
      select: { id: true },
    });
    if (!tracking) return Response.json({ error: "Not found" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const updated = await cancelTracking(tracking.id, typeof body.reason === "string" ? body.reason : undefined);
    return Response.json(updated);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[sla/trackings/:id/cancel] failed", error);
    return Response.json({ error: "Cancel failed" }, { status: 500 });
  }
}
