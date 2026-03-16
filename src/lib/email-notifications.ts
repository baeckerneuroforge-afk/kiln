import { prisma } from "@/lib/prisma";

const FROM = "KILN <noreply@kiln.hephaistos-systems.de>";

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
 * Weekly summary email with key stats. (Stub — implementation coming later)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function sendWeeklySummaryEmail(userId: string, stats: {
  totalConversations: number;
  newLeads: number;
  topAgent: string | null;
}) {
  // TODO: Implement weekly summary email
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
