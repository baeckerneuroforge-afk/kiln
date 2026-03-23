import { prisma } from "@/lib/prisma";

const FROM = "KILN <noreply@kilnbase.com>";

async function sendEmail(to: string, subject: string, html: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
  } catch (err) {
    console.error("[email-notifications] Failed to send:", err);
  }
}

/**
 * Check if user has email notifications enabled, return their email if so.
 */
async function getNotifiableEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailNotifications: true },
  });
  if (!user || !user.emailNotifications) return null;
  // Skip placeholder emails from auto-created users
  if (user.email.endsWith("@clerk.temp")) return null;
  return user.email;
}

/**
 * Notify agent owner when a new conversation starts on their public agent.
 */
export async function sendNewLeadEmail(
  agentOwnerId: string,
  agentName: string,
  firstMessage: string,
  conversationUrl: string
) {
  const email = await getNotifiableEmail(agentOwnerId);
  if (!email) return;

  const preview = firstMessage.length > 200
    ? firstMessage.slice(0, 200) + "..."
    : firstMessage;

  const subject = `New lead on "${agentName}"`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;color:#1a1a1a">
      <p>A new conversation just started on your agent <strong>${escapeHtml(agentName)}</strong>.</p>
      <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;color:#333">
        "${escapeHtml(preview)}"
      </div>
      <a href="${conversationUrl}" style="display:inline-block;background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">
        View Conversation
      </a>
      <p style="color:#888;font-size:12px;margin-top:24px">
        You can disable these notifications in <a href="${conversationUrl.split('/dashboard')[0]}/dashboard/settings" style="color:#888">Settings</a>.
      </p>
      <p style="color:#888;font-size:12px">— The KILN Team</p>
    </div>`;

  await sendEmail(email, subject, html);
}

/**
 * Notify agent owner when a human handoff is requested.
 */
export async function sendHandoffEmail(
  agentOwnerId: string,
  agentName: string,
  reason: string,
  recentMessages: { role: string; content: string }[],
  visitorInfo: { name?: string | null; email?: string | null },
  conversationUrl: string
) {
  const email = await getNotifiableEmail(agentOwnerId);
  if (!email) return;

  const firstLine = recentMessages.find((m) => m.role === "USER")?.content.slice(0, 60) || "Conversation";
  const subject = `Handoff requested: ${agentName} — ${firstLine}`;

  const messagesHtml = recentMessages
    .map((m) => {
      const label = m.role === "USER" ? "Visitor" : "Agent";
      const bg = m.role === "USER" ? "#f5f5f5" : "#fff7ed";
      return `<div style="background:${bg};border-radius:8px;padding:10px 14px;margin:8px 0;font-size:13px">
        <strong style="color:#666">${escapeHtml(label)}:</strong>
        <span style="color:#1a1a1a"> ${escapeHtml(m.content.slice(0, 500))}</span>
      </div>`;
    })
    .join("");

  const visitorHtml = (visitorInfo.name || visitorInfo.email)
    ? `<p style="font-size:13px;color:#333;margin:12px 0 4px"><strong>Visitor info:</strong> ${escapeHtml(visitorInfo.name || "")} ${visitorInfo.email ? `&lt;${escapeHtml(visitorInfo.email)}&gt;` : ""}</p>`
    : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;color:#1a1a1a">
      <p>Your agent <strong>${escapeHtml(agentName)}</strong> requested a human handoff.</p>
      <p style="font-size:13px;color:#666;margin:4px 0 16px"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
      ${visitorHtml}
      <div style="margin:16px 0">
        <p style="font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Recent messages</p>
        ${messagesHtml}
      </div>
      <a href="${conversationUrl}" style="display:inline-block;background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">
        Reply in Dashboard
      </a>
      <p style="color:#888;font-size:12px;margin-top:24px">
        You can disable these notifications in <a href="${conversationUrl.split('/dashboard')[0]}/dashboard/settings" style="color:#888">Settings</a>.
      </p>
      <p style="color:#888;font-size:12px">— The KILN Team</p>
    </div>`;

  await sendEmail(email, subject, html);
}

export async function sendAppointmentConfirmationEmails(params: {
  agentOwnerId: string;
  agentName: string;
  visitorEmail?: string | null;
  visitorName?: string | null;
  start: string;
  end: string;
  timezone?: string | null;
  eventLink?: string | null;
  location?: string | null;
}) {
  const timezone = params.timezone || "UTC";
  const startDate = new Date(params.start);
  const endDate = new Date(params.end);
  const schedule = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(startDate);
  const endTime = new Intl.DateTimeFormat("en-US", {
    timeStyle: "short",
    timeZone: timezone,
  }).format(endDate);

  const ownerEmail = await getNotifiableEmail(params.agentOwnerId);
  if (ownerEmail) {
    await sendEmail(
      ownerEmail,
      `Appointment booked on "${params.agentName}"`,
      `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;color:#1a1a1a">
          <p>A new appointment was booked through <strong>${escapeHtml(params.agentName)}</strong>.</p>
          <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;color:#333">
            <p style="margin:0"><strong>When:</strong> ${escapeHtml(schedule)} - ${escapeHtml(endTime)} (${escapeHtml(timezone)})</p>
            <p style="margin:8px 0 0"><strong>Visitor:</strong> ${escapeHtml(params.visitorName || "Unknown visitor")} ${params.visitorEmail ? `&lt;${escapeHtml(params.visitorEmail)}&gt;` : ""}</p>
            ${params.location ? `<p style="margin:8px 0 0"><strong>Location:</strong> ${escapeHtml(params.location)}</p>` : ""}
          </div>
          ${params.eventLink ? `<a href="${params.eventLink}" style="display:inline-block;background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">Open Calendar Event</a>` : ""}
          <p style="color:#888;font-size:12px;margin-top:24px">— The KILN Team</p>
        </div>
      `
    );
  }

  if (params.visitorEmail) {
    await sendEmail(
      params.visitorEmail,
      `Your appointment with ${params.agentName} is confirmed`,
      `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;color:#1a1a1a">
          <p>${params.visitorName ? `Hi ${escapeHtml(params.visitorName)},` : "Hi,"}</p>
          <p>Your appointment with <strong>${escapeHtml(params.agentName)}</strong> is confirmed.</p>
          <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;color:#333">
            <p style="margin:0"><strong>When:</strong> ${escapeHtml(schedule)} - ${escapeHtml(endTime)} (${escapeHtml(timezone)})</p>
            ${params.location ? `<p style="margin:8px 0 0"><strong>Location:</strong> ${escapeHtml(params.location)}</p>` : ""}
          </div>
          ${params.eventLink ? `<a href="${params.eventLink}" style="display:inline-block;background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">Open Calendar Invite</a>` : ""}
          <p style="color:#888;font-size:12px;margin-top:24px">If you need to reschedule, reply to this email or contact the organizer.</p>
          <p style="color:#888;font-size:12px">— The KILN Team</p>
        </div>
      `
    );
  }
}

/**
 * Weekly summary email with key stats + KB gap analysis.
 * Called from /api/cron/weekly-report — see weekly-kb-report.ts for full implementation.
 */
export async function sendWeeklySummaryEmail(userId: string, stats: {
  totalConversations: number;
  newLeads: number;
  topAgent: string | null;
}) {
  const email = await getNotifiableEmail(userId);
  if (!email) return;

  const subject = `Weekly Report — ${stats.totalConversations} conversations, ${stats.newLeads} leads`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;color:#1a1a1a">
      <p>Your weekly summary is ready.</p>
      <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;color:#333">
        <p style="margin:0"><strong>Conversations:</strong> ${stats.totalConversations}</p>
        <p style="margin:4px 0 0"><strong>Leads:</strong> ${stats.newLeads}</p>
        ${stats.topAgent ? `<p style="margin:4px 0 0"><strong>Top Agent:</strong> ${escapeHtml(stats.topAgent)}</p>` : ""}
      </div>
      <a href="${appUrl}/dashboard" style="display:inline-block;background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">
        View Dashboard
      </a>
      <p style="color:#888;font-size:12px;margin-top:24px">— The KILN Team</p>
    </div>`;

  await sendEmail(email, subject, html);
}

export async function sendTeamScheduleCompletionEmail(params: {
  to: string;
  teamName: string;
  goal: string;
  executionId: string;
  status: string;
  completedTasks: number;
  failedTasks: number;
}) {
  if (!params.to) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
  const subject = `Scheduled team run finished: ${params.teamName}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;color:#1a1a1a">
      <p>Your scheduled team run for <strong>${escapeHtml(params.teamName)}</strong> has finished.</p>
      <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px;color:#333">
        <p style="margin:0"><strong>Status:</strong> ${escapeHtml(params.status)}</p>
        <p style="margin:8px 0 0"><strong>Completed tasks:</strong> ${params.completedTasks}</p>
        <p style="margin:8px 0 0"><strong>Failed tasks:</strong> ${params.failedTasks}</p>
        <p style="margin:8px 0 0"><strong>Input:</strong> ${escapeHtml(params.goal)}</p>
      </div>
      <a href="${appUrl}/dashboard/teams" style="display:inline-block;background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">
        Open Team Executions
      </a>
      <p style="color:#888;font-size:12px;margin-top:24px">Execution ID: ${escapeHtml(params.executionId)}</p>
      <p style="color:#888;font-size:12px">— The KILN Team</p>
    </div>`;

  await sendEmail(params.to, subject, html);
}

export async function sendTeamApprovalRequestEmail(params: {
  approverEmail: string;
  teamName: string;
  goal?: string | null;
  executionId: string;
  approvalMessage: string;
  previousDecision: string;
  nextStep: string;
  approveUrl: string;
  rejectUrl: string;
  sharedContext?: Record<string, unknown>;
  timeoutHours?: number;
}) {
  if (!params.approverEmail) return;

  const sharedContext = params.sharedContext
    ? JSON.stringify(params.sharedContext, null, 2)
    : "{}";
  const subject = `Approval needed: ${params.teamName}`;

  await sendEmail(
    params.approverEmail,
    subject,
    `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;color:#1a1a1a">
        <p>A running KILN team needs approval before it can continue.</p>
        <div style="background:#f5f5f5;border-radius:10px;padding:14px 16px;margin:16px 0;font-size:14px;color:#333">
          <p style="margin:0"><strong>Team:</strong> ${escapeHtml(params.teamName)}</p>
          <p style="margin:8px 0 0"><strong>Execution:</strong> ${escapeHtml(params.executionId.slice(0, 8))}</p>
          ${params.goal ? `<p style="margin:8px 0 0"><strong>Goal:</strong> ${escapeHtml(params.goal)}</p>` : ""}
          <p style="margin:8px 0 0"><strong>Approval message:</strong> ${escapeHtml(params.approvalMessage)}</p>
          <p style="margin:8px 0 0"><strong>Previous decision:</strong> ${escapeHtml(params.previousDecision.slice(0, 1500))}</p>
          <p style="margin:8px 0 0"><strong>What happens next:</strong> ${escapeHtml(params.nextStep)}</p>
          <p style="margin:8px 0 0"><strong>Timeout:</strong> ${params.timeoutHours || 24} hour(s)</p>
        </div>
        <div style="margin:16px 0 20px">
          <p style="font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Shared team context</p>
          <pre style="background:#111827;color:#e5e7eb;border-radius:10px;padding:12px 14px;font-size:12px;overflow:auto;white-space:pre-wrap">${escapeHtml(sharedContext)}</pre>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <a href="${params.approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
            Approve
          </a>
          <a href="${params.rejectUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
            Reject
          </a>
        </div>
        <p style="color:#888;font-size:12px;margin-top:20px">These links open a token-protected approval page.</p>
        <p style="color:#888;font-size:12px">— The KILN Team</p>
      </div>
    `
  );
}

/**
 * Send team invitation email.
 */
export async function sendTeamInviteEmail(
  email: string,
  teamName: string,
  role: string,
  inviteToken: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
  const acceptUrl = `${baseUrl}/api/teams/invite/accept?token=${inviteToken}`;

  const roleLabels: Record<string, string> = {
    EDITOR: "Editor — kann Agents und Prompts bearbeiten, Ausführungen starten",
    VIEWER: "Viewer — kann Ausführungen und Analytics einsehen",
    APPROVER: "Approver — kann Approval-Gate-Anfragen genehmigen oder ablehnen",
  };

  const roleLabel = roleLabels[role] || role;

  await sendEmail(
    email,
    `Einladung: Team "${teamName}" auf KILN`,
    `
    <div style="font-family: 'DM Sans', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; background: #0C0A09; color: #FAFAF9; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #F97316, #DC2626); padding: 32px 24px; text-align: center;">
        <div style="display: inline-block; background: white; border-radius: 8px; padding: 8px 12px; margin-bottom: 16px;">
          <span style="font-family: 'Instrument Serif', serif; font-size: 24px; color: #0C0A09; font-weight: bold;">K</span>
        </div>
        <h1 style="margin: 0; font-size: 22px; color: white; font-weight: 600;">Team-Einladung</h1>
      </div>
      <div style="padding: 32px 24px;">
        <p style="color: #A8A29E; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Sie wurden zum Team <strong style="color: #FAFAF9;">"${teamName}"</strong> eingeladen.
        </p>
        <div style="background: #1C1917; border: 1px solid #292524; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <p style="color: #A8A29E; font-size: 12px; margin: 0 0 4px;">Ihre Rolle:</p>
          <p style="color: #F97316; font-size: 14px; font-weight: 600; margin: 0;">${roleLabel}</p>
        </div>
        <a href="${acceptUrl}" style="display: block; background: #F97316; color: white; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 10px; font-size: 14px; font-weight: 600;">
          Einladung annehmen
        </a>
        <p style="color: #78716C; font-size: 11px; margin: 24px 0 0; text-align: center;">
          Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.
        </p>
      </div>
    </div>
    `
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
