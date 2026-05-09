import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { listRecentBreaches } from "@/lib/sla/reports";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") || "20", 10);
    const breaches = await listRecentBreaches({
      orgId: scope.orgId,
      limit: Number.isFinite(limit) ? limit : 20,
    });
    return Response.json({ breaches });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[sla/reports/breaches] failed", error);
    return Response.json({ error: "Breaches report failed" }, { status: 500 });
  }
}
