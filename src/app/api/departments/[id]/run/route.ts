import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { asJsonRecord } from "@/lib/departments/json";
import { triggerDepartment } from "@/lib/departments/department-engine";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await requireOrgId();
    const department = await prisma.department.findFirst({
      where: { id: params.id, ...orgScopeFilter(scope) },
      select: { id: true },
    });
    if (!department) return Response.json({ error: "Not found" }, { status: 404 });

    const payload = asJsonRecord(await request.json().catch(() => ({})));
    await triggerDepartment(params.id, { triggerType: "MANUAL", payload });

    return Response.json({ status: "queued" });
  } catch (error) {
    if (error instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Failed to run department" }, { status: 500 });
  }
}
