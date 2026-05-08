import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await requireOrgId();
    const department = await prisma.department.findFirst({
      where: { id: params.id, ...orgScopeFilter(scope) },
      select: { id: true },
    });
    if (!department) return Response.json({ error: "Not found" }, { status: 404 });

    const items = await prisma.departmentBacklogItem.findMany({
      where: { departmentId: params.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return Response.json(items);
  } catch (error) {
    if (error instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Failed to load backlog" }, { status: 500 });
  }
}
