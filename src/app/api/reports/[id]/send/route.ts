import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { sendCustomerReport } from "@/lib/reporting/sender";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const report = await prisma.customerReport.findFirst({
      where: { id: params.id, orgId: scope.orgId },
      select: { id: true },
    });
    if (!report) return Response.json({ error: "Not found" }, { status: 404 });
    const result = await sendCustomerReport(report.id);
    return Response.json(result);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[reports/send] failed", error);
    return Response.json({ error: "Send failed" }, { status: 500 });
  }
}
