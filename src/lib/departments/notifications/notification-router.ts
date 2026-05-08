import { prisma } from "@/lib/prisma";
import { logDepartmentChannelEvent } from "@/lib/departments/channels/logging";
import {
  buildApprovalSlackText,
  sendSlackApprovalNotification,
} from "./slack-notifier";
import {
  parseEmailRecipients,
  sendApprovalEmail,
} from "./email-notifier";

export type NotifyChannelKind = "EMAIL" | "WHATSAPP" | "INTERNAL";

export interface NotifyApprovalArgs {
  departmentId: string;
  backlogItemId: string;
  draftedAction: Record<string, unknown>;
  channel: NotifyChannelKind;
}

export interface NotifyApprovalResult {
  notified: boolean;
  via: string[];
}

export async function notifyApprovalNeeded(
  args: NotifyApprovalArgs
): Promise<NotifyApprovalResult> {
  const department = await prisma.department.findUnique({
    where: { id: args.departmentId },
    select: {
      id: true,
      name: true,
      userId: true,
      orgId: true,
      notifyOnApprovalNeeded: true,
      notifyChannel: true,
      notifySlackChannel: true,
      notifyEmailRecipients: true,
      notifyDigestEnabled: true,
    },
  });

  if (!department) {
    return { notified: false, via: [] };
  }

  if (!department.notifyOnApprovalNeeded) {
    return { notified: false, via: [] };
  }

  if (department.notifyChannel === "NONE") {
    return { notified: false, via: [] };
  }

  if (department.notifyDigestEnabled) {
    await logDepartmentChannelEvent({
      departmentId: department.id,
      backlogItemId: args.backlogItemId,
      event: "approval_notification_digest_queued",
      channel: "NOTIFICATION",
      status: "QUEUED",
    });
    return { notified: false, via: ["digest-queued"] };
  }

  const draftPreview = extractDraftPreview(args.draftedAction);
  const fromIdentity = extractFromIdentity(args.draftedAction);
  const subject = extractSubject(args.draftedAction);
  const approvalUrl = buildApprovalUrl(department.id, args.backlogItemId);

  const wantsSlack =
    department.notifyChannel === "SLACK_ONLY" ||
    department.notifyChannel === "SLACK_THEN_EMAIL";
  const wantsEmail =
    department.notifyChannel === "EMAIL_ONLY" ||
    department.notifyChannel === "SLACK_THEN_EMAIL";

  const via: string[] = [];

  if (wantsSlack && department.notifySlackChannel) {
    const slackText = buildApprovalSlackText({
      departmentName: department.name,
      channel: args.channel,
      from: fromIdentity,
      subject,
      preview: draftPreview,
      approvalUrl,
    });

    const slackResult = await sendSlackApprovalNotification({
      userId: department.userId,
      orgId: department.orgId,
      slackChannel: department.notifySlackChannel,
      text: slackText,
    });

    await logDepartmentChannelEvent({
      departmentId: department.id,
      backlogItemId: args.backlogItemId,
      event: slackResult.ok
        ? "approval_notification_sent"
        : "approval_notification_failed",
      channel: "SLACK",
      status: slackResult.ok ? "SENT" : "FAILED",
      error: slackResult.ok ? null : slackResult.error || "unknown",
    });

    if (slackResult.ok) {
      via.push("slack");
    }
  }

  if (wantsEmail) {
    const recipients = parseEmailRecipients(department.notifyEmailRecipients);
    if (recipients.length > 0) {
      const emailResult = await sendApprovalEmail({
        departmentName: department.name,
        recipients,
        channel: args.channel,
        fromIdentity,
        subject,
        preview: draftPreview,
        approvalUrl,
        orgId: department.orgId,
      });

      await logDepartmentChannelEvent({
        departmentId: department.id,
        backlogItemId: args.backlogItemId,
        event: emailResult.blocked
          ? "approval_notification_blocked"
          : emailResult.ok
            ? "approval_notification_sent"
            : "approval_notification_failed",
        channel: "NOTIFICATION_EMAIL",
        status: emailResult.blocked
          ? "BLOCKED"
          : emailResult.ok
            ? "SENT"
            : "FAILED",
        error: emailResult.ok ? null : emailResult.error || emailResult.blockedReason || "unknown",
      });

      if (emailResult.ok) {
        via.push("email");
      } else if (emailResult.blocked) {
        via.push("email-blocked");
      }
    }
  }

  return { notified: via.includes("slack") || via.includes("email"), via };
}

export function extractDraftPreview(draft: Record<string, unknown>): string {
  const candidates = [draft.body, draft.text, draft.preview, draft.message];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  try {
    return JSON.stringify(draft).slice(0, 500);
  } catch {
    return "";
  }
}

export function extractFromIdentity(
  draft: Record<string, unknown>
): string | null {
  const candidates = [draft.from, draft.sender, draft.to];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function extractSubject(
  draft: Record<string, unknown>
): string | null {
  if (typeof draft.subject === "string" && draft.subject.length > 0) {
    return draft.subject;
  }
  return null;
}

function buildApprovalUrl(departmentId: string, itemId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
  return `${base}/dashboard/departments/${departmentId}/approvals?item=${itemId}`;
}
