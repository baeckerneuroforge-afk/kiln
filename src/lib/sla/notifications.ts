import { prisma } from "@/lib/prisma";
import { sendSlackApprovalNotification } from "@/lib/departments/notifications/slack-notifier";
import { sendApprovalEmail, parseEmailRecipients } from "@/lib/departments/notifications/email-notifier";
import type { SlaEscalationEvent } from "./tracker";

interface NotifyResult {
  notified: boolean;
  via: string[];
  errors: string[];
}

/**
 * Sends a slack and/or email notification for an SLA warning or breach.
 * Reuses the department's existing Slack/email channel configuration; the
 * SlaPolicy.escalationChannel field controls which transports are tried.
 */
export async function dispatchSlaEscalation(event: SlaEscalationEvent): Promise<NotifyResult> {
  const department = await prisma.department.findUnique({
    where: { id: event.departmentId },
    select: {
      id: true,
      name: true,
      userId: true,
      orgId: true,
      notifySlackChannel: true,
      notifyEmailRecipients: true,
    },
  });
  if (!department) return { notified: false, via: [], errors: ["department-not-found"] };

  const channel = (event.escalationChannel || "BOTH").toUpperCase();
  const wantsSlack = channel === "SLACK" || channel === "BOTH";
  const wantsEmail = channel === "EMAIL" || channel === "BOTH";

  const subject = event.type === "BREACHED"
    ? `SLA-Bruch: ${department.name}, Antwort ueberfaellig`
    : `SLA-Warnung: ${department.name}, ${event.elapsedMinutes}/${event.targetMinutes} Min verbraucht`;
  const body = buildEscalationBody(department.name, event);

  const via: string[] = [];
  const errors: string[] = [];

  if (wantsSlack && department.notifySlackChannel) {
    try {
      const slack = await sendSlackApprovalNotification({
        userId: department.userId,
        orgId: department.orgId,
        slackChannel: department.notifySlackChannel,
        text: `*${subject}*\n${body}`,
      });
      if (slack.ok) via.push("slack");
      else errors.push(`slack:${slack.error || "unknown"}`);
    } catch (err) {
      errors.push(`slack:${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  if (wantsEmail) {
    const recipients = parseEmailRecipients(department.notifyEmailRecipients);
    if (recipients.length > 0) {
      try {
        const result = await sendApprovalEmail({
          departmentName: department.name,
          recipients,
          channel: "INTERNAL",
          fromIdentity: "SLA Monitor",
          subject,
          preview: body,
          approvalUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard/sla`,
          orgId: department.orgId,
        });
        if (result.ok) via.push("email");
        else errors.push(`email:${result.error || (result.blocked ? "blocked" : "unknown")}`);
      } catch (err) {
        errors.push(`email:${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  }

  return { notified: via.length > 0, via, errors };
}

function buildEscalationBody(departmentName: string, event: SlaEscalationEvent): string {
  const lines: string[] = [];
  lines.push(`Department: ${departmentName}`);
  lines.push(`Status: ${event.type}`);
  lines.push(`Verbrauchte Zeit: ${event.elapsedMinutes} Min`);
  lines.push(`Ziel-Reaktionszeit: ${event.targetMinutes} Min`);
  if (event.escalationTargetUserId) {
    lines.push(`Eskalations-Ziel: User ${event.escalationTargetUserId}`);
  }
  lines.push(`Tracking: ${event.trackingId}`);
  return lines.join("\n");
}
