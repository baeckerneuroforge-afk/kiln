import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { isDepartmentAutoSendBlocked } from "@/lib/departments/channels/safety";
import { logDepartmentChannelEvent } from "@/lib/departments/channels/logging";
import { parseEmailRecipients } from "./email-notifier";
import {
  extractDraftPreview,
  extractFromIdentity,
  extractSubject,
} from "./notification-router";

export interface DigestRunResult {
  departmentsProcessed: number;
  digestsSent: number;
  digestsBlocked: number;
  digestsFailed: number;
}

export interface DigestPendingItem {
  id: string;
  channel: string;
  from: string | null;
  subject: string | null;
  preview: string;
  createdAt: Date;
}

export async function runDailyApprovalDigest(): Promise<DigestRunResult> {
  const departments = await prisma.department.findMany({
    where: {
      notifyDigestEnabled: true,
      notifyOnApprovalNeeded: true,
      status: { in: ["ACTIVE", "DRAFT"] },
    },
    select: {
      id: true,
      name: true,
      notifyChannel: true,
      notifyEmailRecipients: true,
      notifyDigestSentAt: true,
    },
  });

  const result: DigestRunResult = {
    departmentsProcessed: departments.length,
    digestsSent: 0,
    digestsBlocked: 0,
    digestsFailed: 0,
  };

  for (const dept of departments) {
    if (
      dept.notifyChannel !== "EMAIL_ONLY" &&
      dept.notifyChannel !== "SLACK_THEN_EMAIL"
    ) {
      // Digest delivery is email-only; skip configurations that don't include email.
      continue;
    }

    const recipients = parseEmailRecipients(dept.notifyEmailRecipients);
    if (recipients.length === 0) continue;

    const since = dept.notifyDigestSentAt || new Date(0);
    const items = await prisma.departmentBacklogItem.findMany({
      where: {
        departmentId: dept.id,
        status: "NEEDS_APPROVAL",
        createdAt: { gt: since },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        approvalDraft: true,
        triggerPayload: true,
        createdAt: true,
      },
    });

    if (items.length === 0) continue;

    const pendingItems: DigestPendingItem[] = items.map((item) => {
      const draft = (item.approvalDraft || {}) as Record<string, unknown>;
      const trigger = (item.triggerPayload || {}) as Record<string, unknown>;
      return {
        id: item.id,
        channel: typeof trigger.channel === "string" ? trigger.channel : "INTERNAL",
        from: extractFromIdentity(draft) || extractFromIdentity(trigger),
        subject: extractSubject(draft) || extractSubject(trigger),
        preview: extractDraftPreview(draft),
        createdAt: item.createdAt,
      };
    });

    if (isDepartmentAutoSendBlocked()) {
      result.digestsBlocked++;
      await logDepartmentChannelEvent({
        departmentId: dept.id,
        event: "approval_digest_blocked",
        channel: "NOTIFICATION_EMAIL",
        status: "BLOCKED",
        error: "DEPARTMENT_BLOCK_AUTO_SEND=true",
        payload: { itemCount: pendingItems.length },
      });
      continue;
    }

    const sendResult = await sendDigestEmail({
      departmentName: dept.name,
      departmentId: dept.id,
      recipients,
      items: pendingItems,
    });

    if (sendResult.ok) {
      await prisma.department.update({
        where: { id: dept.id },
        data: { notifyDigestSentAt: new Date() },
      });
      result.digestsSent++;
      await logDepartmentChannelEvent({
        departmentId: dept.id,
        event: "approval_digest_sent",
        channel: "NOTIFICATION_EMAIL",
        status: "SENT",
        payload: { itemCount: pendingItems.length, externalId: sendResult.externalId },
      });
    } else {
      result.digestsFailed++;
      await logDepartmentChannelEvent({
        departmentId: dept.id,
        event: "approval_digest_failed",
        channel: "NOTIFICATION_EMAIL",
        status: "FAILED",
        error: sendResult.error || "unknown",
        payload: { itemCount: pendingItems.length },
      });
    }
  }

  return result;
}

interface DigestSendArgs {
  departmentName: string;
  departmentId: string;
  recipients: string[];
  items: DigestPendingItem[];
}

interface DigestSendResult {
  ok: boolean;
  error?: string;
  externalId?: string;
}

async function sendDigestEmail(args: DigestSendArgs): Promise<DigestSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_resend_api_key" };

  const fromAddress =
    process.env.DEPARTMENT_NOTIFICATION_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    "KILN Notifications <noreply@kilnbase.com>";

  try {
    const resend = new Resend(apiKey);
    const subject = `[KILN] Daily digest — ${args.departmentName} (${args.items.length} pending)`;
    const response = await resend.emails.send({
      from: fromAddress,
      to: args.recipients,
      subject,
      text: buildDigestText(args),
      html: buildDigestHtml(args),
    });
    return { ok: true, externalId: response.data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

export function buildDigestText(args: DigestSendArgs): string {
  const lines: string[] = [
    `Daily digest — ${args.departmentName}`,
    `${args.items.length} drafts await your review.`,
    ``,
  ];

  for (const item of args.items) {
    lines.push(`• ${item.channel} — ${item.subject || "(no subject)"}`);
    if (item.from) lines.push(`  From: ${item.from}`);
    lines.push(`  Created: ${item.createdAt.toISOString()}`);
    lines.push(`  ${buildItemUrl(args.departmentId, item.id)}`);
    lines.push("");
  }

  lines.push(`— KILN`);
  return lines.join("\n");
}

export function buildDigestHtml(args: DigestSendArgs): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const itemsHtml = args.items
    .map(
      (item) => `
        <li style="margin-bottom: 12px;">
          <strong>${escape(item.channel)}</strong> — ${escape(item.subject || "(no subject)")}<br/>
          ${item.from ? `<span style="color: #666;">From: ${escape(item.from)}</span><br/>` : ""}
          <a href="${escape(buildItemUrl(args.departmentId, item.id))}" style="color: #F97316;">View Draft</a>
        </li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0C0A09;">
  <h2 style="margin: 0 0 8px;">Daily digest — ${escape(args.departmentName)}</h2>
  <p style="color: #666;">${args.items.length} drafts await your review.</p>
  <ul style="padding-left: 20px;">${itemsHtml}</ul>
  <p style="color: #666; font-size: 12px; margin-top: 32px;">— KILN</p>
</body>
</html>`;
}

function buildItemUrl(departmentId: string, itemId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
  return `${base}/dashboard/departments/${departmentId}/approvals?item=${itemId}`;
}
