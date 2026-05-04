import { listUserTasks } from "@/lib/quick-use/background-executor";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";

export const dynamic = "force-dynamic";

export async function GET() {
  let scope;
  try {
    scope = await requireOrgId();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  const tasks = await listUserTasks(scope.userId, 20, scope.orgId);
  return Response.json({ tasks });
}
