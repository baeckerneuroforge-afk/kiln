import { prisma } from "@/lib/prisma";
import { generateAndSendForConfig } from "./sender";
import { previousMonthRange, previousWeekRange } from "./generator";

export interface ReportCronResult {
  configsInspected: number;
  reportsGenerated: number;
  reportsSent: number;
  failures: number;
}

/**
 * Daily entry point for monthly + weekly customer reports. Looks up all
 * enabled configs whose schedule matches today/now and runs each one
 * sequentially to avoid overwhelming the email transport.
 *
 * Hobby-plan caveat (see process-queue cron docs): the master cron runs
 * once per day. sendHour is therefore advisory — we do not enforce it
 * down to the hour.
 */
export async function runReportCron(now: Date = new Date()): Promise<ReportCronResult> {
  const day = now.getUTCDate();
  const dow = now.getUTCDay(); // 0=Sun..6=Sat

  const configs = await prisma.customerReportConfig.findMany({
    where: { isEnabled: true, frequency: { in: ["MONTHLY", "WEEKLY"] } },
  });

  let reportsGenerated = 0;
  let reportsSent = 0;
  let failures = 0;

  for (const config of configs) {
    const matchesMonthly =
      config.frequency === "MONTHLY" && Math.min(28, Math.max(1, config.sendDayOfMonth)) === day;
    // Weekly fires on Mondays (UTC) regardless of sendDayOfMonth.
    const matchesWeekly = config.frequency === "WEEKLY" && dow === 1;
    if (!matchesMonthly && !matchesWeekly) continue;

    const recipient = config.recipientEmails[0];
    if (!recipient) continue;

    const range =
      config.frequency === "MONTHLY" ? previousMonthRange(now) : previousWeekRange(now);

    if (!config.sendOnEmpty) {
      const inboundCount = await prisma.departmentChannelMessage.count({
        where: {
          department: { orgId: config.orgId },
          direction: "INBOUND",
          createdAt: { gte: range.start, lte: range.end },
        },
      });
      if (inboundCount === 0) continue;
    }

    const result = await generateAndSendForConfig({
      orgId: config.orgId,
      periodStart: range.start,
      periodEnd: range.end,
      recipientEmail: recipient,
    });
    reportsGenerated += 1;
    if (result.sent) reportsSent += 1;
    if (!result.sent) failures += 1;
  }

  return { configsInspected: configs.length, reportsGenerated, reportsSent, failures };
}
