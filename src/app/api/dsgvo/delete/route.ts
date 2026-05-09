import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { createDeletionRequest, type DataDeletionScope } from "@/lib/dsgvo/delete-service";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

const SCOPE_VALUES = ["FULL", "CUSTOMERS_ONLY", "AUDIT_ONLY"];

export async function GET() {
  try {
    const scope = await requireOrgId();
    const deletions = await prisma.dataDeletionRequest.findMany({
      where: { orgId: scope.orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return Response.json({ deletions });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to list deletions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const deletionScope: DataDeletionScope = SCOPE_VALUES.includes(body.scope) ? body.scope : "FULL";
    const reason = typeof body.reason === "string" ? body.reason : null;
    const row = await createDeletionRequest({
      orgId: ctx.orgId,
      requestedByUserId: ctx.userId,
      scope: deletionScope,
      reason,
    });
    return Response.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[dsgvo/delete] failed", error);
    return Response.json({ error: "Deletion request failed" }, { status: 500 });
  }
}
