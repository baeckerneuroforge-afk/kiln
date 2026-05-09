import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { mergeCustomerProfiles } from "@/lib/customer-memory/identifier";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const duplicateId = typeof body.duplicateId === "string" ? body.duplicateId : null;
    if (!duplicateId) return Response.json({ error: "duplicateId required" }, { status: 400 });

    const [primary, duplicate] = await Promise.all([
      prisma.customerProfile.findFirst({ where: { id: params.id, orgId: scope.orgId } }),
      prisma.customerProfile.findFirst({ where: { id: duplicateId, orgId: scope.orgId } }),
    ]);
    if (!primary || !duplicate) return Response.json({ error: "Not found" }, { status: 404 });

    const merged = await mergeCustomerProfiles({
      orgId: scope.orgId,
      primaryId: primary.id,
      duplicateId: duplicate.id,
      actorUserId: scope.userId,
    });
    return Response.json(merged);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers/merge] failed", error);
    return Response.json({ error: "Merge failed" }, { status: 500 });
  }
}
