import { NextRequest } from "next/server";
import { getTaskDetail } from "@/lib/quick-use/background-executor";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  let scope;
  try {
    scope = await requireOrgId();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  const { taskId } = await params;
  const task = await getTaskDetail(taskId, scope.userId, scope.orgId);

  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json({ task });
}
