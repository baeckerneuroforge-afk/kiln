import { prisma } from "@/lib/prisma";

export interface ReportMetrics {
  conversationsTotal: number;
  conversationsHandled: number;
  manualEscalations: number;
  approvalsTotal: number;
  approvalsApproved: number;
  approvalsRejected: number;
  approvalsRate: number; // 0-100
  slaCompliancePercent: number; // 0-100
  slaTrackingsCount: number;
  avgFirstResponseMinutes: number | null;
  newCustomers: number;
  returningCustomers: number;
  topTopics: Array<{ topic: string; count: number }>;
  costSavedEur: number;
  totalLlmCostUsd?: number;
  totalNaiveLlmCostUsd?: number;
  llmCostSavedUsd?: number;
  llmSavingsPercent?: number;
}

export interface ComputeMetricsArgs {
  orgId: string;
  periodStart: Date;
  periodEnd: Date;
  costPerConversationEur?: number;
}

const DEFAULT_COST_PER_CONVERSATION_EUR = 8.5;

/**
 * Computes the report metrics for a given org and period from primary
 * source tables. Only reads — never writes — so safe to call repeatedly.
 */
export async function computeReportMetrics(args: ComputeMetricsArgs): Promise<ReportMetrics> {
  const period = { gte: args.periodStart, lte: args.periodEnd };
  const [
    inboundCount,
    outboundCount,
    backlogItems,
    rejectedCount,
    slaRows,
    customerProfiles,
    topTopics,
    llmSavings,
  ] = await Promise.all([
    prisma.departmentChannelMessage.count({
      where: { department: { orgId: args.orgId }, direction: "INBOUND", createdAt: period },
    }),
    prisma.departmentChannelMessage.count({
      where: { department: { orgId: args.orgId }, direction: "OUTBOUND", createdAt: period, status: "SENT" },
    }),
    prisma.departmentBacklogItem.findMany({
      where: { department: { orgId: args.orgId }, createdAt: period },
      select: { id: true, status: true, rejectedAt: true, approvedAt: true },
    }),
    prisma.departmentBacklogItem.count({
      where: { department: { orgId: args.orgId }, createdAt: period, rejectedAt: { not: null } },
    }),
    prisma.slaTracking.findMany({
      where: { orgId: args.orgId, startedAt: period },
      select: { status: true, firstResponseMinutes: true },
    }),
    prisma.customerProfile.findMany({
      where: { orgId: args.orgId, firstSeenAt: { lte: args.periodEnd } },
      select: { firstSeenAt: true, totalConversations: true, lastSeenAt: true },
    }),
    extractTopTopics(args.orgId, args.periodStart, args.periodEnd),
    computeLlmSavings(args.orgId, args.periodStart, args.periodEnd),
  ]);

  const approvalsApproved = backlogItems.filter((item) => item.approvedAt && !item.rejectedAt).length;
  const approvalsRejected = rejectedCount;
  const approvalsTotal = backlogItems.length;
  const approvalsRate = approvalsTotal === 0 ? 0 : Math.round(((approvalsApproved + approvalsRejected) / approvalsTotal) * 100);

  let metSla = 0;
  let breachedSla = 0;
  let firstResponseSum = 0;
  let firstResponseCount = 0;
  for (const row of slaRows) {
    if (row.status === "MET") metSla += 1;
    if (row.status === "BREACHED") breachedSla += 1;
    if (typeof row.firstResponseMinutes === "number") {
      firstResponseSum += row.firstResponseMinutes;
      firstResponseCount += 1;
    }
  }
  const slaSettled = metSla + breachedSla;
  const slaCompliancePercent = slaSettled === 0 ? 100 : Math.round((metSla / slaSettled) * 100);
  const avgFirstResponseMinutes = firstResponseCount === 0 ? null : Math.round(firstResponseSum / firstResponseCount);

  let newCustomers = 0;
  let returningCustomers = 0;
  for (const profile of customerProfiles) {
    if (profile.firstSeenAt >= args.periodStart) newCustomers += 1;
    if (profile.totalConversations > 1 && profile.lastSeenAt >= args.periodStart) returningCustomers += 1;
  }

  // Conservative: a fully-handled conversation is one that resulted in a SENT outbound.
  const conversationsHandled = Math.min(outboundCount, inboundCount);
  const manualEscalations = approvalsRejected;
  const automatedCount = Math.max(0, conversationsHandled - manualEscalations);
  const cost = args.costPerConversationEur ?? DEFAULT_COST_PER_CONVERSATION_EUR;
  const costSavedEur = Math.round(automatedCount * cost);

  return {
    conversationsTotal: inboundCount,
    conversationsHandled,
    manualEscalations,
    approvalsTotal,
    approvalsApproved,
    approvalsRejected,
    approvalsRate,
    slaTrackingsCount: slaRows.length,
    slaCompliancePercent,
    avgFirstResponseMinutes,
    newCustomers,
    returningCustomers,
    topTopics,
    costSavedEur,
    totalLlmCostUsd: llmSavings.totalCostUsd,
    totalNaiveLlmCostUsd: llmSavings.totalNaiveCostUsd,
    llmCostSavedUsd: llmSavings.totalSavedUsd,
    llmSavingsPercent: llmSavings.savingsPercent,
  };
}

async function computeLlmSavings(
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{
  totalCostUsd: number;
  totalSavedUsd: number;
  totalNaiveCostUsd: number;
  savingsPercent: number;
}> {
  try {
    const rows = await prisma.llmUsage.findMany({
      where: { orgId, createdAt: { gte: periodStart, lte: periodEnd } },
      select: { costUsd: true, costSavedUsd: true },
    });
    const totalCostUsd = rows.reduce((sum, row) => sum + Number(row.costUsd), 0);
    const totalSavedUsd = rows.reduce((sum, row) => sum + Number(row.costSavedUsd), 0);
    const totalNaiveCostUsd = totalCostUsd + totalSavedUsd;
    return {
      totalCostUsd,
      totalSavedUsd,
      totalNaiveCostUsd,
      savingsPercent: totalNaiveCostUsd > 0 ? Math.round((totalSavedUsd / totalNaiveCostUsd) * 100) : 0,
    };
  } catch {
    return { totalCostUsd: 0, totalSavedUsd: 0, totalNaiveCostUsd: 0, savingsPercent: 0 };
  }
}

/**
 * Cluster top topics from inbound message subjects (email) or department
 * names (whatsapp) for the period. Cheap heuristic: lowercase + truncate.
 */
async function extractTopTopics(
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<Array<{ topic: string; count: number }>> {
  const messages = await prisma.departmentChannelMessage.findMany({
    where: {
      department: { orgId },
      direction: "INBOUND",
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    select: { emailSubject: true, channel: true, department: { select: { name: true } } },
    take: 1_000,
  });
  const counter = new Map<string, number>();
  for (const message of messages) {
    const topic = (message.emailSubject ?? message.department?.name ?? "Allgemein").trim().slice(0, 80);
    const normalized = topic.toLowerCase();
    counter.set(normalized, (counter.get(normalized) ?? 0) + 1);
  }
  return Array.from(counter.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export function buildHighlights(metrics: ReportMetrics, monthLabel: string): string[] {
  const highlights: string[] = [];
  highlights.push(`${metrics.conversationsTotal} Anfragen im ${monthLabel} bearbeitet`);
  if (metrics.avgFirstResponseMinutes !== null) {
    highlights.push(`${metrics.avgFirstResponseMinutes} Min. durchschnittliche Reaktionszeit`);
  }
  highlights.push(`${metrics.slaCompliancePercent}% innerhalb SLA`);
  if (metrics.costSavedEur > 0) {
    highlights.push(`${metrics.costSavedEur.toLocaleString("de-DE")}€ Personalkosten gespart`);
  }
  if (metrics.llmCostSavedUsd && metrics.llmCostSavedUsd > 0) {
    highlights.push(
      `${formatUsdAsEur(metrics.llmCostSavedUsd)} vs naiver LLM-Implementierung gespart (${metrics.llmSavingsPercent ?? 0}%)`,
    );
  }
  if (metrics.newCustomers > 0) {
    highlights.push(`${metrics.newCustomers} neue Kunden gewonnen`);
  }
  return highlights;
}

function formatUsdAsEur(value: number): string {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`;
}
