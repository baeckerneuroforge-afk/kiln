import type { CustomerReport } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendBrandedEmail } from "@/lib/email/send-branded-email";
import { logAudit } from "@/lib/audit/logger";
import { markReportFailed, markReportSent, monthLabelFor } from "./generator";

export interface SendReportResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

/**
 * Sends a previously-generated report to its recipientEmail using the
 * branded-email pipeline. Records SENT/FAILED status + audit log.
 */
export async function sendCustomerReport(reportId: string): Promise<SendReportResult> {
  const report = await prisma.customerReport.findUnique({ where: { id: reportId } });
  if (!report) return { ok: false, error: "report-not-found" };
  if (!report.recipientEmail) {
    await markReportFailed(report.id, "missing-recipient");
    return { ok: false, error: "missing-recipient" };
  }

  const metrics = (report.metrics as Record<string, unknown>) ?? {};
  const highlights = (report.highlights as string[] | null) ?? [];
  const monthLabel = monthLabelFor(report.periodStart);

  const result = await sendBrandedEmail({
    template: "monthly-report",
    to: report.recipientEmail,
    orgId: report.orgId,
    subOrgId: report.orgId,
    data: {
      customerName: report.recipientName ?? "Kunde",
      monthLabel,
      totalConversations: Number(metrics.conversationsTotal ?? 0),
      totalLeads: Number(metrics.newCustomers ?? 0),
      totalApprovals: Number(metrics.approvalsTotal ?? 0),
      reportUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/reports/${report.id}`,
      avgFirstResponseMinutes: (metrics.avgFirstResponseMinutes as number | null) ?? null,
      slaCompliancePercent: Number(metrics.slaCompliancePercent ?? 0),
      costSavedEur: Number(metrics.costSavedEur ?? 0),
      newCustomers: Number(metrics.newCustomers ?? 0),
      returningCustomers: Number(metrics.returningCustomers ?? 0),
      highlights,
      topTopics: (metrics.topTopics as Array<{ topic: string; count: number }> | undefined) ?? [],
      customMessage: null,
    },
  });

  if (!result.ok) {
    await markReportFailed(report.id, result.error || "send-failed");
    await logAudit({
      orgId: report.orgId,
      actorType: "SYSTEM",
      action: "REPORT_SEND_FAILED",
      resourceType: "CUSTOMER_REPORT",
      resourceId: report.id,
      severity: "WARN",
      description: result.error || "send-failed",
    });
    return { ok: false, error: result.error };
  }

  await markReportSent(report.id);
  await logAudit({
    orgId: report.orgId,
    actorType: "SYSTEM",
    action: "REPORT_SENT",
    resourceType: "CUSTOMER_REPORT",
    resourceId: report.id,
    description: `Monthly report sent to ${report.recipientEmail}`,
    metadata: { externalId: result.externalId },
  });
  return { ok: true, externalId: result.externalId };
}

export async function generateAndSendForConfig(args: {
  orgId: string;
  periodStart: Date;
  periodEnd: Date;
  recipientEmail: string;
  recipientName?: string | null;
}): Promise<{ report: CustomerReport | null; sent: boolean; error?: string }> {
  const { generateReport } = await import("./generator");
  try {
    const result = await generateReport({
      orgId: args.orgId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      periodType: "MONTHLY",
      triggerType: "CRON",
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName ?? null,
    });
    if (!result.report) return { report: null, sent: false, error: "no-report-record" };
    const send = await sendCustomerReport(result.report.id);
    return { report: result.report, sent: send.ok, error: send.error };
  } catch (err) {
    return { report: null, sent: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
