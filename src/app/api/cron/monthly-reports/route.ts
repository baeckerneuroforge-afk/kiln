/**
 * Monthly Usage Reports Cron
 * Sendet am 1. des Monats Credit-Usage-Reports an alle aktiven User.
 * Vercel Cron: 0 8 1 * * (1. des Monats, 8:00 UTC)
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateUserReport, renderUsageReportEmail } from "@/lib/reports/monthly-usage-report";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Verify Vercel Cron secret (fail-closed)
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  try {
    // Alle User mit Credits-Nutzung im letzten Monat
    const startOfLastMonth = new Date();
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
    startOfLastMonth.setDate(1);
    startOfLastMonth.setHours(0, 0, 0, 0);

    const usersWithUsage = await prisma.aiCreditUsage.findMany({
      where: { createdAt: { gte: startOfLastMonth } },
      select: { userId: true },
      distinct: ["userId"],
    });

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const { userId } of usersWithUsage) {
      try {
        const report = await generateUserReport(userId);
        if (!report || report.creditsUsed === 0) {
          skipped++;
          continue;
        }

        const html = renderUsageReportEmail(report);
        const monthName = new Date().toLocaleDateString("de-DE", { month: "long" });

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "KILN <noreply@kilnbase.com>",
            to: [report.email],
            subject: `KILN Credit Report ${monthName} — ${report.creditsUsed} Credits verwendet (${report.usagePercent}%)`,
            html,
          }),
        });

        sent++;
      } catch {
        errors++;
      }
    }

    return Response.json({
      success: true,
      usersFound: usersWithUsage.length,
      emailsSent: sent,
      skipped,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[Monthly Reports Cron]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
