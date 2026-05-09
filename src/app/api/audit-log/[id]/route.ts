import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const entry = await prisma.auditLog.findFirst({
      where: { id: params.id, orgId: scope.orgId },
    });
    if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(entry);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to load audit entry" }, { status: 500 });
  }
}
