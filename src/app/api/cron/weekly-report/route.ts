import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateWeeklyReport, buildWeeklyReportHtml } from "@/lib/weekly-kb-report";
import { verifyCronSecret } from "@/lib/api-auth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// POST /api/cron/weekly-report — Wöchentlicher KB-Report jeden Montag 9:00 UTC
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

  try {
    // Alle User mit mindestens 1 LIVE Agent und aktiviertem Weekly Report
    const users = await prisma.user.findMany({
      where: {
        weeklyReportEnabled: true,
        emailNotifications: true,
        agents: { some: { status: "LIVE" } },
      },
      select: {
        id: true,
        email: true,
      },
    });

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Placeholder-Emails überspringen
        if (user.email.endsWith("@clerk.temp")) {
          skipped++;
          continue;
        }

        const report = await generateWeeklyReport(user.id);
        if (!report) {
          skipped++;
          continue;
        }

        // HTML generieren und User-ID + HMAC-Token für Unsubscribe-Link einsetzen
        const unsubscribeToken = createHmac("sha256", process.env.UNSUBSCRIBE_SECRET || "kiln-unsub-default")
          .update(user.id)
          .digest("hex");
        const html = buildWeeklyReportHtml(report, appUrl)
          .replace("USER_ID_PLACEHOLDER", user.id)
          .replace("UNSUBSCRIBE_TOKEN_PLACEHOLDER", unsubscribeToken);

        const gapCount = report.agents.reduce((sum, a) => sum + a.gaps.length, 0);
        const subject = gapCount > 0
          ? `${gapCount} KB gap${gapCount !== 1 ? "s" : ""} found — Weekly Report`
          : `All clear — Weekly Report (${report.totalConversations} chats)`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "KILN <noreply@kilnbase.com>",
            to: [user.email],
            subject,
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
      usersProcessed: users.length,
      emailsSent: sent,
      skipped,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
