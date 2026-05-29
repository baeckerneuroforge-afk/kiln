import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  detectTrends,
  saveTrendAlerts,
  updateWeeklyHistory,
  buildTrendAlertEmail,
} from "@/lib/enterprise-alerts";
import { verifyCronSecret } from "@/lib/api-auth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// POST /api/cron/trend-alerts — Wöchentlich: Trends erkennen, Alerts erstellen, E-Mails senden
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

  try {
    // Alle User mit Enterprise Insights
    const users = await prisma.user.findMany({
      where: {
        enableTrendAlerts: true,
        emailNotifications: true,
      },
      select: { id: true, email: true },
    });

    let totalAlerts = 0;
    let emailsSent = 0;

    for (const user of users) {
      // 1. Weekly History aktualisieren
      await updateWeeklyHistory(user.id);

      // 2. Trends erkennen
      const alerts = await detectTrends(user.id);
      if (alerts.length === 0) continue;

      // 3. Alerts in DB speichern
      await saveTrendAlerts(user.id, alerts);
      totalAlerts += alerts.length;

      // 4. E-Mail senden
      if (resendKey && !user.email.endsWith("@clerk.temp")) {
        const { subject, html } = buildTrendAlertEmail(alerts, appUrl);
        try {
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
          emailsSent++;
        } catch {
          // E-Mail-Fehler überspringen
        }
      }
    }

    return Response.json({
      success: true,
      usersProcessed: users.length,
      totalAlerts,
      emailsSent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
