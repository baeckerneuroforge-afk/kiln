import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { patchMemory, readMemory } from "@/lib/departments/operating-memory";
import { asJsonRecord } from "@/lib/departments/json";
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
    return Response.json(await readMemory(params.id));
  } catch (error) {
    if (error instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Failed to load memory" }, { status: 500 });
  }
}

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
    const patch = asJsonRecord(await request.json().catch(() => ({})));
    await patchMemory(params.id, patch);
    return Response.json(await readMemory(params.id));
  } catch (error) {
    if (error instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Failed to update memory" }, { status: 500 });
  }
}
