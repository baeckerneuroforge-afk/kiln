import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { computeCompliance } from "@/lib/sla/reports";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const url = new URL(request.url);
    const departmentId = url.searchParams.get("departmentId") ?? undefined;
    const [seven, thirty] = await Promise.all([
      computeCompliance({ orgId: scope.orgId, departmentId, windowDays: 7 }),
      computeCompliance({ orgId: scope.orgId, departmentId, windowDays: 30 }),
    ]);
    return Response.json({ last7Days: seven, last30Days: thirty });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[sla/reports/compliance] failed", error);
    return Response.json({ error: "Compliance report failed" }, { status: 500 });
  }
}
