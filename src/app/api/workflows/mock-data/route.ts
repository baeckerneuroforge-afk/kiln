import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { listMockData, saveMockData } from "@/lib/workflows/mock-data";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const url = new URL(request.url);
    const workflowId = url.searchParams.get("workflowId");
    const nodeId = url.searchParams.get("nodeId") ?? undefined;
    if (!workflowId) return Response.json({ error: "workflowId required" }, { status: 400 });
    const items = await listMockData({ orgId: scope.orgId, workflowId, nodeId });
    return Response.json({ items });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[workflows/mock-data] list failed", error);
    return Response.json({ error: "Failed to list mock data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const workflowId = typeof body.workflowId === "string" ? body.workflowId : null;
    const nodeId = typeof body.nodeId === "string" ? body.nodeId : null;
    const name = typeof body.name === "string" ? body.name : null;
    if (!workflowId || !nodeId || !name) {
      return Response.json({ error: "workflowId, nodeId, name required" }, { status: 400 });
    }
    const created = await saveMockData({
      orgId: scope.orgId,
      workflowId,
      nodeId,
      name,
      data: body.data ?? null,
      isDefault: body.isDefault === true,
    });
    return Response.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    if (error instanceof Error && error.message.includes("exceeds")) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    console.error("[workflows/mock-data] create failed", error);
    return Response.json({ error: "Failed to save mock data" }, { status: 500 });
  }
}
