import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/api-auth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// POST /api/cron/monthly-report — Send monthly ROI emails to all active users
export async function POST(request: NextRequest) {
  // Verify Vercel Cron secret (timing-safe)
  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

  try {
    // Get all users who have at least 1 LIVE agent
    const users = await prisma.user.findMany({
      where: {
        agents: { some: { status: "LIVE" } },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
      },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let sent = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Get user's agent IDs first
        const userAgents = await prisma.agent.findMany({
          where: { userId: user.id },
          select: { id: true },
        });
        const agentIds = userAgents.map((a) => a.id);

        // Get monthly stats
        const [conversations, leads, agentCount] = await Promise.all([
          prisma.conversation.count({
            where: {
              agentId: { in: agentIds },
              createdAt: { gte: thirtyDaysAgo },
            },
          }),
          prisma.lead.count({
            where: {
              agentId: { in: agentIds },
              createdAt: { gte: thirtyDaysAgo },
            },
          }),
          prisma.agent.count({
            where: { userId: user.id, status: "LIVE" },
          }),
        ]);

        // Skip if no activity
        if (conversations === 0 && leads === 0) continue;

        // Estimate value: €100 per lead (conservative SaaS benchmark)
        const estimatedValue = leads * 100;

        const displayName = user.firstName || "there";

        const html = `
<!DOCTYPE html>
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
    <h1 style="font-family:serif;font-size:28px;color:#F5F5F5;text-align:center;margin:0 0 8px">Your Monthly Report</h1>
    <p style="color:#A3A3A3;text-align:center;font-size:14px;margin:0 0 32px">Hey ${displayName}, here&rsquo;s what your AI agents accomplished this month.</p>

    <!-- Stats Grid -->
    <div style="display:flex;gap:12px;margin-bottom:24px">
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:32px;font-weight:700;color:#F97316">${conversations}</div>
        <div style="font-size:12px;color:#A3A3A3;margin-top:4px">Conversations</div>
      </div>
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:32px;font-weight:700;color:#22C55E">${leads}</div>
        <div style="font-size:12px;color:#A3A3A3;margin-top:4px">Leads Captured</div>
      </div>
      <div style="flex:1;background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:32px;font-weight:700;color:#F5F5F5">&euro;${estimatedValue.toLocaleString("de-DE")}</div>
        <div style="font-size:12px;color:#A3A3A3;margin-top:4px">Est. Value</div>
      </div>
    </div>

    <!-- Summary -->
    <div style="background:#1C1917;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:32px">
      <p style="color:#D4D4D4;font-size:14px;line-height:1.6;margin:0">
        Your <strong style="color:#F5F5F5">${agentCount} active agent${agentCount !== 1 ? "s" : ""}</strong> handled
        <strong style="color:#F97316">${conversations} conversations</strong> and captured
        <strong style="color:#22C55E">${leads} leads</strong> this month.
        ${estimatedValue > 0 ? `That&rsquo;s an estimated pipeline value of <strong style="color:#F5F5F5">&euro;${estimatedValue.toLocaleString("de-DE")}</strong>.` : ""}
        Keep building!
      </p>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px">
      <a href="${appUrl}/dashboard" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#F97316,#DC2626);color:#fff;text-decoration:none;border-radius:12px;font-size:14px;font-weight:600">
        View Dashboard
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

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "KILN <noreply@kilnbase.com>",
            to: [user.email],
            subject: `Your KILN Monthly Report — ${conversations} conversations, ${leads} leads`,
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
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
