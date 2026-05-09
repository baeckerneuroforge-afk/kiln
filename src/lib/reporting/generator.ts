import type { CustomerReport, CustomerReportConfig, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveEmailBranding } from "@/lib/email/branding-resolver";
import { renderEmail } from "@/lib/email/template-renderer";
import { buildHighlights, computeReportMetrics, type ReportMetrics } from "./metrics";

export type ReportPeriodType = "MONTHLY" | "WEEKLY" | "CUSTOM";
export type ReportTriggerType = "CRON" | "MANUAL" | "API";

export interface GenerateReportArgs {
  orgId: string;
  periodStart: Date;
  periodEnd: Date;
  periodType?: ReportPeriodType;
  triggerType?: ReportTriggerType;
  triggeredByUserId?: string | null;
  recipientEmail?: string;
  recipientName?: string | null;
  customMessage?: string | null;
  config?: CustomerReportConfig | null;
  /** When true, render-only (no DB write) — used by /preview. */
  preview?: boolean;
  baseUrl?: string;
}

export interface GenerateReportResult {
  metrics: ReportMetrics;
  highlights: string[];
  htmlBody: string;
  subject: string;
  monthLabel: string;
  customerName: string;
  recipientEmail: string;
  report?: CustomerReport;
}

export function monthLabelFor(periodStart: Date): string {
  return periodStart.toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function previousMonthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end };
}

export function previousWeekRange(now: Date): { start: Date; end: Date } {
  const day = now.getUTCDay();
  const diff = (day + 6) % 7; // monday = 0
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff - 7));
  const nextMonday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 7));
  return { start: monday, end: nextMonday };
}

export async function generateReport(args: GenerateReportArgs): Promise<GenerateReportResult> {
  const periodType = args.periodType ?? "MONTHLY";
  const recipientEmail =
    args.recipientEmail ?? args.config?.recipientEmails[0] ?? "no-recipient@kilnbase.invalid";
  const recipientName = args.recipientName ?? null;

  const metrics = await computeReportMetrics({
    orgId: args.orgId,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
  });
  const monthLabel = monthLabelFor(args.periodStart);
  const highlights = buildHighlights(metrics, monthLabel);

  const branding = await resolveEmailBranding({ orgId: args.orgId, subOrgId: args.orgId });
  const baseUrl = args.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const reportUrl = `${baseUrl}/dashboard/reports`;

  const customerName = recipientName ?? branding.brandName ?? "Kunde";

  const rendered = await renderEmail({
    template: "monthly-report",
    branding,
    data: {
      customerName,
      monthLabel,
      totalConversations: metrics.conversationsTotal,
      totalLeads: metrics.newCustomers,
      totalApprovals: metrics.approvalsTotal,
      reportUrl,
      avgFirstResponseMinutes: metrics.avgFirstResponseMinutes,
      slaCompliancePercent: metrics.slaCompliancePercent,
      costSavedEur: metrics.costSavedEur,
      llmCostSavedUsd: metrics.llmCostSavedUsd,
      llmSavingsPercent: metrics.llmSavingsPercent,
      newCustomers: metrics.newCustomers,
      returningCustomers: metrics.returningCustomers,
      highlights,
      topTopics: metrics.topTopics,
      customMessage: args.customMessage ?? args.config?.customMessage ?? null,
    },
  });

  const result: GenerateReportResult = {
    metrics,
    highlights,
    htmlBody: rendered.html,
    subject: rendered.subject,
    monthLabel,
    customerName,
    recipientEmail,
  };

  if (args.preview) return result;

  const report = await prisma.customerReport.create({
    data: {
      orgId: args.orgId,
      periodType,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      status: "READY",
      metrics: metrics as unknown as Prisma.InputJsonValue,
      highlights: highlights as unknown as Prisma.InputJsonValue,
      htmlBody: rendered.html,
      recipientEmail,
      recipientName,
      triggerType: args.triggerType ?? "MANUAL",
      triggeredByUserId: args.triggeredByUserId ?? null,
    },
  });
  result.report = report;
  return result;
}

export async function markReportFailed(reportId: string, errorMessage: string): Promise<void> {
  await prisma.customerReport.update({
    where: { id: reportId },
    data: { status: "FAILED", errorMessage },
  });
}

export async function markReportSent(reportId: string): Promise<CustomerReport> {
  return prisma.customerReport.update({
    where: { id: reportId },
    data: { status: "SENT", sentAt: new Date() },
  });
}
