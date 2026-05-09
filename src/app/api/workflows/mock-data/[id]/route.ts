import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { deleteMockData, setDefaultMockData } from "@/lib/workflows/mock-data";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    if (body.action !== "set-default") {
      return Response.json({ error: "action=set-default required" }, { status: 400 });
    }
    const updated = await setDefaultMockData({ orgId: scope.orgId, id: params.id });
    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(updated);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to update mock data" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const ok = await deleteMockData({ orgId: scope.orgId, id: params.id });
    if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to delete mock data" }, { status: 500 });
  }
}
