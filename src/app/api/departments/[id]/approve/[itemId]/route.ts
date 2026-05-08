import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { approveBacklogItem } from "@/lib/departments/department-engine";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const scope = await requireOrgId();
    const item = await prisma.departmentBacklogItem.findFirst({
      where: {
        id: params.itemId,
        departmentId: params.id,
        department: orgScopeFilter(scope),
      },
      select: { id: true },
    });
    if (!item) return Response.json({ error: "Not found" }, { status: 404 });

    await approveBacklogItem(params.itemId, scope.userId, scope);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to approve item" },
      { status: 500 }
    );
  }
}
