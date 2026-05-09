import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { generateReport } from "@/lib/reporting/generator";
import { sendCustomerReport } from "@/lib/reporting/sender";
import { logAudit } from "@/lib/audit/logger";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const orgId = typeof body.orgId === "string" ? body.orgId : scope.orgId;
    if (orgId !== scope.orgId) {
      // Sub-Org users can only generate for their own org. Agency-level
      // cross-org generation is reserved for the agency dashboard which
      // hits the cron-style sender directly.
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const periodStart = body.periodStart ? new Date(body.periodStart) : null;
    const periodEnd = body.periodEnd ? new Date(body.periodEnd) : null;
    if (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return Response.json({ error: "periodStart and periodEnd required (ISO date)" }, { status: 400 });
    }
    if (periodStart >= periodEnd) {
      return Response.json({ error: "periodStart must be before periodEnd" }, { status: 400 });
    }

    const config = await prisma.customerReportConfig.findUnique({ where: { orgId } });
    const recipientEmail =
      typeof body.recipientEmail === "string" && body.recipientEmail
        ? body.recipientEmail
        : config?.recipientEmails[0] ?? null;
    if (!recipientEmail) {
      return Response.json({ error: "recipientEmail required (no default recipient configured)" }, { status: 400 });
    }

    const result = await generateReport({
      orgId,
      periodStart,
      periodEnd,
      periodType: "CUSTOM",
      triggerType: "MANUAL",
      triggeredByUserId: scope.userId,
      recipientEmail,
      recipientName: typeof body.recipientName === "string" ? body.recipientName : null,
      customMessage: typeof body.customMessage === "string" ? body.customMessage : null,
      config,
    });
    if (!result.report) {
      return Response.json({ error: "Failed to persist report" }, { status: 500 });
    }

    await logAudit({
      orgId,
      actorUserId: scope.userId,
      actorOrgId: scope.orgId,
      action: "REPORT_GENERATED",
      resourceType: "CUSTOMER_REPORT",
      resourceId: result.report.id,
      description: `Manual report generated for ${result.monthLabel}`,
      metadata: { sendImmediately: body.sendImmediately === true },
    });

    if (body.sendImmediately === true) {
      const sendResult = await sendCustomerReport(result.report.id);
      return Response.json({ report: result.report, sent: sendResult.ok, sendError: sendResult.error ?? null });
    }
    return Response.json({ report: result.report });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[reports/generate] failed", error);
    return Response.json({ error: "Generate failed" }, { status: 500 });
  }
}
