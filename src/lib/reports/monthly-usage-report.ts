/**
 * Monthly Usage Report
 * Generiert monatliche Credit-Usage-Reports und sendet sie per E-Mail.
 */

import { prisma } from "@/lib/prisma";
import { getPlanCredits } from "@/lib/credits";

interface UserUsageReport {
  userId: string;
  email: string;
  displayName: string;
  plan: string;
  totalCredits: number;
  creditsUsed: number;
  creditsRemaining: number;
  usagePercent: number;
  byType: { type: string; credits: number }[];
  topAgents: { agentName: string; credits: number }[];
  totalConversations: number;
  totalLeads: number;
}

/**
 * Generiert den Usage Report für einen einzelnen User.
 */
export async function generateUserReport(userId: string): Promise<UserUsageReport | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      plan: true,
      creditTier: true,
      aiCreditsMonthly: true,
      aiCreditsBalance: true,
    },
  });
  if (!user) return null;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Agent-IDs vorab laden für Conversations/Leads-Abfragen
  const userAgents = await prisma.agent.findMany({
    where: { userId },
    select: { id: true },
  });
  const agentIds = userAgents.map((a) => a.id);

  const [byType, topAgents, totalUsed, conversations, leads] = await Promise.all([
    prisma.$queryRaw<{ type: string; total: bigint }[]>`
      SELECT "type", SUM("creditsUsed")::bigint as total
      FROM "AiCreditUsage"
      WHERE "userId" = ${userId} AND "createdAt" >= ${startOfMonth}
      GROUP BY "type"
      ORDER BY total DESC
    `,
    prisma.$queryRaw<{ agentName: string; total: bigint }[]>`
      SELECT COALESCE(a."name", 'Unknown') as "agentName", SUM(u."creditsUsed")::bigint as total
      FROM "AiCreditUsage" u
      LEFT JOIN "Agent" a ON u."agentId" = a."id"
      WHERE u."userId" = ${userId} AND u."createdAt" >= ${startOfMonth} AND u."agentId" IS NOT NULL
      GROUP BY a."name"
      ORDER BY total DESC
      LIMIT 5
    `,
    prisma.aiCreditUsage.aggregate({
      where: { userId, createdAt: { gte: startOfMonth } },
      _sum: { creditsUsed: true },
    }),
    prisma.conversation.count({
      where: {
        agentId: { in: agentIds },
        createdAt: { gte: startOfMonth },
      },
    }),
    prisma.lead.count({
      where: {
        agentId: { in: agentIds },
        createdAt: { gte: startOfMonth },
      },
    }),
  ]);

  const totalCredits = user.aiCreditsMonthly || getPlanCredits(user.plan, user.creditTier);
  const creditsUsed = totalUsed._sum.creditsUsed || 0;

  return {
    userId: user.id,
    email: user.email,
    displayName: user.firstName || "there",
    plan: user.plan,
    totalCredits,
    creditsUsed,
    creditsRemaining: user.aiCreditsBalance,
    usagePercent: totalCredits > 0 ? Math.round((creditsUsed / totalCredits) * 100) : 0,
    byType: byType.map((t) => ({ type: t.type, credits: Number(t.total) })),
    topAgents: topAgents.map((a) => ({ agentName: a.agentName, credits: Number(a.total) })),
    totalConversations: conversations,
    totalLeads: leads,
  };
}

/**
 * Generiert die HTML-E-Mail für den monatlichen Usage Report.
 */
export function renderUsageReportEmail(report: UserUsageReport): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
  const monthName = new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const typeLabels: Record<string, string> = {
    CHAT: "Chat",
    TEAM_TASK: "Team Tasks",
    ORCHESTRATION: "Orchestration",
    SCHEDULED: "Scheduled",
    WEBHOOK: "Webhooks",
    EMBEDDING: "Embeddings",
    TASK_RUN: "Task Runs",
  };

  const usageRows = report.byType
    .map(
      (t) =>
        `<tr>
          <td style="padding:8px 12px;color:#D4D4D4;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.04)">${typeLabels[t.type] || t.type}</td>
          <td style="padding:8px 12px;color:#F5F5F5;font-size:13px;text-align:right;border-bottom:1px solid rgba(255,255,255,0.04)">${t.credits}</td>
        </tr>`
    )
    .join("");

  const agentRows = report.topAgents
    .map(
      (a) =>
        `<tr>
          <td style="padding:8px 12px;color:#D4D4D4;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.04)">${a.agentName}</td>
          <td style="padding:8px 12px;color:#F5F5F5;font-size:13px;text-align:right;border-bottom:1px solid rgba(255,255,255,0.04)">${a.credits}</td>
        </tr>`
    )
    .join("");

  const usageColor =
    report.usagePercent >= 90 ? "#DC2626" : report.usagePercent >= 70 ? "#F97316" : "#22C55E";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0C0A09;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-block;width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#F97316,#DC2626);line-height:36px;text-align:center;font-family:serif;font-size:18px;font-weight:700;color:#fff">K</div>
      <span style="margin-left:8px;font-family:serif;font-size:20px;color:#F5F5F5;vertical-align:middle">KILN</span>
    </div>

    <!-- Title -->
    <h1 style="font-family:serif;font-size:28px;color:#F5F5F5;text-align:center;margin:0 0 8px">Credit Usage Report</h1>
    <p style="color:#A3A3A3;text-align:center;font-size:14px;margin:0 0 32px">${monthName} &middot; ${report.plan} Plan</p>

    <!-- Usage Overview -->
    <div style="display:flex;gap:12px;margin-bottom:24px">
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:32px;font-weight:700;color:${usageColor}">${report.usagePercent}%</div>
        <div style="font-size:12px;color:#A3A3A3;margin-top:4px">Credits Used</div>
      </div>
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:32px;font-weight:700;color:#F97316">${report.creditsUsed}</div>
        <div style="font-size:12px;color:#A3A3A3;margin-top:4px">von ${report.totalCredits}</div>
      </div>
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:32px;font-weight:700;color:#F5F5F5">${report.creditsRemaining}</div>
        <div style="font-size:12px;color:#A3A3A3;margin-top:4px">Remaining</div>
      </div>
    </div>

    <!-- Activity -->
    <div style="display:flex;gap:12px;margin-bottom:24px">
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:#F97316">${report.totalConversations}</div>
        <div style="font-size:11px;color:#A3A3A3;margin-top:4px">Conversations</div>
      </div>
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:#22C55E">${report.totalLeads}</div>
        <div style="font-size:11px;color:#A3A3A3;margin-top:4px">Leads</div>
      </div>
    </div>

    ${
      usageRows
        ? `<!-- Usage by Type -->
    <div style="background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:16px">
      <h3 style="color:#F5F5F5;font-size:14px;margin:0 0 12px">Usage by Type</h3>
      <table style="width:100%;border-collapse:collapse">
        ${usageRows}
      </table>
    </div>`
        : ""
    }

    ${
      agentRows
        ? `<!-- Top Agents -->
    <div style="background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:32px">
      <h3 style="color:#F5F5F5;font-size:14px;margin:0 0 12px">Top Agents</h3>
      <table style="width:100%;border-collapse:collapse">
        ${agentRows}
      </table>
    </div>`
        : ""
    }

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px">
      <a href="${appUrl}/dashboard/settings?tab=billing" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#F97316,#DC2626);color:#fff;text-decoration:none;border-radius:12px;font-size:14px;font-weight:600">
        View Billing Details
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px">
      <p style="color:#525252;font-size:11px;margin:0">
        KILN by Hephaistos Systems &middot;
        <a href="${appUrl}/dashboard/settings" style="color:#525252">Settings</a> &middot;
        <a href="https://discord.gg/kiln" style="color:#525252">Community</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
