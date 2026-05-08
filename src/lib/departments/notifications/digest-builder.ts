import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { isDepartmentAutoSendBlocked } from "@/lib/departments/channels/safety";
import { logDepartmentChannelEvent } from "@/lib/departments/channels/logging";
import {
  formatFromHeader,
  resolveEmailBranding,
} from "@/lib/email/branding-resolver";
import { renderEmail } from "@/lib/email/template-renderer";
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
      orgId: true,
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
      orgId: dept.orgId,
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
  orgId: string | null;
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

  const branding = await resolveEmailBranding({ orgId: args.orgId });

  const rendered = await renderEmail({
    template: "department-digest",
    branding,
    data: {
      departmentName: args.departmentName,
      items: args.items.map((item) => ({
        itemUrl: buildItemUrl(args.departmentId, item.id),
        channel: item.channel,
        subject: item.subject,
        from: item.from,
        createdAt: item.createdAt.toISOString(),
      })),
    },
  });

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: formatFromHeader(branding),
      to: args.recipients,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: branding.replyTo || undefined,
    });
    return { ok: true, externalId: response.data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

function buildItemUrl(departmentId: string, itemId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
  return `${base}/dashboard/departments/${departmentId}/approvals?item=${itemId}`;
}
