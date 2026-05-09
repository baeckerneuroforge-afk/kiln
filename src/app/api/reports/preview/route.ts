import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { generateReport } from "@/lib/reporting/generator";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const periodStart = body.periodStart ? new Date(body.periodStart) : null;
    const periodEnd = body.periodEnd ? new Date(body.periodEnd) : null;
    if (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return Response.json({ error: "periodStart and periodEnd required" }, { status: 400 });
    }
    const result = await generateReport({
      orgId: scope.orgId,
      periodStart,
      periodEnd,
      periodType: "CUSTOM",
      triggerType: "API",
      triggeredByUserId: scope.userId,
      recipientEmail: typeof body.recipientEmail === "string" ? body.recipientEmail : "preview@example.invalid",
      recipientName: typeof body.recipientName === "string" ? body.recipientName : null,
      customMessage: typeof body.customMessage === "string" ? body.customMessage : null,
      preview: true,
    });
    return Response.json({
      htmlBody: result.htmlBody,
      subject: result.subject,
      monthLabel: result.monthLabel,
      metrics: result.metrics,
      highlights: result.highlights,
    });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[reports/preview] failed", error);
    return Response.json({ error: "Preview failed" }, { status: 500 });
  }
}
