import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const row = await prisma.dataExportRequest.findFirst({
      where: { id: params.id, orgId: scope.orgId },
    });
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({
      ...row,
      fileSizeBytes: row.fileSizeBytes ? row.fileSizeBytes.toString() : null,
    });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to load export" }, { status: 500 });
  }
}
