/**
 * Enterprise Trend Alerts V1.0
 * Automatische Erkennung von Trend-Veränderungen und Benachrichtigung per E-Mail.
 */

import { prisma } from "@/lib/prisma";

export interface TrendAlertData {
  type: "surge" | "decline" | "new_topic" | "competitor_spike";
  topic: string;
  changePercent: number;
  thisWeek: number;
  lastWeek: number;
}

interface WeeklyEntry {
  week: string; // ISO date
  count: number;
}

/**
 * Erkennt Trends durch Vergleich der aktuellen mit der Vorwoche.
 */
export async function detectTrends(userId: string): Promise<TrendAlertData[]> {
  const insights = await prisma.enterpriseInsight.findMany({
    where: { userId },
    orderBy: { mentionCount: "desc" },
  });

  const alerts: TrendAlertData[] = [];
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);

  for (const insight of insights) {
    const history = (insight.weeklyHistory as WeeklyEntry[] | null) || [];
    if (history.length < 2) {
      // Neues Topic: nur in dieser Woche aufgetaucht
      if (
        insight.firstSeenAt >= oneWeekAgo &&
        insight.mentionCount >= 2
      ) {
        alerts.push({
          type: "new_topic",
          topic: insight.topic,
          changePercent: 100,
          thisWeek: insight.mentionCount,
          lastWeek: 0,
        });
      }
      continue;
    }

    // Letzte 2 Wochen-Einträge vergleichen
    const thisWeekEntry = history[history.length - 1];
    const lastWeekEntry = history[history.length - 2];

    const thisWeek = thisWeekEntry?.count || 0;
    const lastWeek = lastWeekEntry?.count || 0;

    if (lastWeek === 0 && thisWeek > 0) {
      alerts.push({
        type: "new_topic",
        topic: insight.topic,
        changePercent: 100,
        thisWeek,
        lastWeek: 0,
      });
      continue;
    }

    if (lastWeek === 0) continue;

    const changePercent = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);

    if (changePercent > 30) {
      alerts.push({
        type: insight.type === "competitor" ? "competitor_spike" : "surge",
        topic: insight.topic,
        changePercent,
        thisWeek,
        lastWeek,
      });
    } else if (changePercent < -30) {
      alerts.push({
        type: "decline",
        topic: insight.topic,
        changePercent,
        thisWeek,
        lastWeek,
      });
    }
  }

  return alerts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

/**
 * Speichert erkannte Alerts in der DB.
 */
export async function saveTrendAlerts(
  userId: string,
  alerts: TrendAlertData[]
): Promise<void> {
  for (const alert of alerts) {
    await prisma.trendAlert.create({
      data: {
        userId,
        type: alert.type,
        topic: alert.topic,
        changePercent: alert.changePercent,
        thisWeek: alert.thisWeek,
        lastWeek: alert.lastWeek,
      },
    });
  }
}

/**
 * Lädt aktive (nicht dismisste) Alerts für einen User.
 */
export async function getActiveAlerts(userId: string) {
  return prisma.trendAlert.findMany({
    where: { userId, dismissed: false },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

/**
 * Alert als gelesen markieren.
 */
export async function dismissAlert(alertId: string, userId: string) {
  return prisma.trendAlert.updateMany({
    where: { id: alertId, userId },
    data: { dismissed: true },
  });
}

/**
 * Baut die HTML-Email für Trend Alerts.
 */
export function buildTrendAlertEmail(
  alerts: TrendAlertData[],
  appUrl: string
): { subject: string; html: string } {
  // Bestes Alert für Subject-Line
  const topAlert = alerts[0];
  const direction = topAlert.changePercent > 0 ? "+" : "";
  const subject = `KILN Trend Alert: ${topAlert.topic} ${direction}${topAlert.changePercent}% diese Woche`;

  const alertRows = alerts
    .map((a) => {
      const arrow = a.type === "decline" ? "↓" : "↑";
      const color = a.type === "decline" ? "#EF4444" : a.type === "new_topic" ? "#3B82F6" : "#22C55E";
      const label =
        a.type === "new_topic"
          ? "NEU"
          : a.type === "competitor_spike"
          ? "WETTBEWERBER"
          : a.changePercent > 0
          ? `+${a.changePercent}%`
          : `${a.changePercent}%`;

      // Bar width relativ (max 200px)
      const maxCount = Math.max(a.thisWeek, a.lastWeek, 1);
      const thisWidth = Math.round((a.thisWeek / maxCount) * 200);
      const lastWidth = Math.round((a.lastWeek / maxCount) * 200);

      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #27272a;">
            <div style="font-size:14px;font-weight:600;color:#FAFAFA;">${arrow} ${a.topic}</div>
            <div style="margin-top:4px;">
              <span style="display:inline-block;background:${color};color:#000;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;">
                ${label}
              </span>
            </div>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #27272a;text-align:right;">
            <div style="font-size:11px;color:#A1A1AA;margin-bottom:4px;">Diese Woche</div>
            <div style="background:#27272a;border-radius:4px;height:8px;width:200px;display:inline-block;text-align:left;">
              <div style="background:${color};height:8px;border-radius:4px;width:${thisWidth}px;"></div>
            </div>
            <span style="font-size:13px;font-weight:600;color:#FAFAFA;margin-left:8px;">${a.thisWeek}</span>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #27272a;text-align:right;">
            <div style="font-size:11px;color:#A1A1AA;margin-bottom:4px;">Letzte Woche</div>
            <div style="background:#27272a;border-radius:4px;height:8px;width:200px;display:inline-block;text-align:left;">
              <div style="background:#52525b;height:8px;border-radius:4px;width:${lastWidth}px;"></div>
            </div>
            <span style="font-size:13px;color:#A1A1AA;margin-left:8px;">${a.lastWeek}</span>
          </td>
        </tr>`;
    })
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0C0A09;font-family:'DM Sans',sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:40px;height:40px;background:linear-gradient(135deg,#F97316,#DC2626);border-radius:8px;line-height:40px;color:#fff;font-family:'Instrument Serif',serif;font-size:20px;font-weight:700;">K</div>
    </div>
    <h1 style="color:#FAFAFA;font-size:20px;font-weight:600;text-align:center;margin:0 0 4px;">
      ${alerts.length} Trend${alerts.length !== 1 ? "s" : ""} erkannt
    </h1>
    <p style="color:#A1A1AA;font-size:13px;text-align:center;margin:0 0 24px;">
      Wöchentliche Trend-Analyse deiner Agent-Gespräche
    </p>
    <table style="width:100%;border-collapse:collapse;background:#18181b;border-radius:12px;overflow:hidden;">
      <thead>
        <tr style="border-bottom:1px solid #27272a;">
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#71717a;font-weight:500;">TOPIC</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;color:#71717a;font-weight:500;">DIESE WOCHE</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;color:#71717a;font-weight:500;">LETZTE WOCHE</th>
        </tr>
      </thead>
      <tbody>${alertRows}</tbody>
    </table>
    <div style="text-align:center;margin-top:24px;">
      <a href="${appUrl}/dashboard/intelligence" style="display:inline-block;background:#F97316;color:#000;font-size:13px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
        Intelligence Dashboard öffnen →
      </a>
    </div>
    <p style="color:#52525b;font-size:11px;text-align:center;margin-top:24px;">
      Du erhältst diese E-Mail, weil Trend Alerts aktiviert sind.
    </p>
  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Aktualisiert die weeklyHistory für alle Insights eines Users.
 * Sollte einmal pro Woche laufen (Sonntag/Montag).
 */
export async function updateWeeklyHistory(userId: string): Promise<void> {
  const insights = await prisma.enterpriseInsight.findMany({
    where: { userId },
  });

  const weekLabel = new Date().toISOString().split("T")[0];

  for (const insight of insights) {
    const history = (insight.weeklyHistory as WeeklyEntry[] | null) || [];

    // Aktuelle Mentions dieser Woche = seit letztem Snapshot
    const lastSnapshot = history[history.length - 1];
    const lastTotal = lastSnapshot
      ? history.reduce((sum, h) => sum + h.count, 0)
      : 0;
    const thisWeekCount = Math.max(0, insight.mentionCount - lastTotal);

    const updatedHistory = [
      ...history.slice(-7), // max 8 Wochen behalten
      { week: weekLabel, count: thisWeekCount },
    ];

    await prisma.enterpriseInsight.update({
      where: { id: insight.id },
      data: { weeklyHistory: JSON.parse(JSON.stringify(updatedHistory)) },
    });
  }
}
