import { isDepartmentAutoSendBlocked } from "@/lib/departments/channels/safety";
import { resolveEmailBranding, formatFromHeader } from "@/lib/email/branding-resolver";
import { renderEmail } from "@/lib/email/template-renderer";
import { Resend } from "resend";

export interface ApprovalEmailArgs {
  departmentName: string;
  recipients: string[];
  channel: string;
  fromIdentity: string | null | undefined;
  subject: string | null | undefined;
  preview: string;
  approvalUrl: string;
  orgId?: string | null;
  subOrgId?: string | null;
}

export interface ApprovalEmailResult {
  ok: boolean;
  blocked?: boolean;
  blockedReason?: string;
  error?: string;
  externalId?: string;
}

export async function sendApprovalEmail(
  args: ApprovalEmailArgs
): Promise<ApprovalEmailResult> {
  if (args.recipients.length === 0) {
    return { ok: false, error: "no_recipients" };
  }

  if (isDepartmentAutoSendBlocked()) {
    return {
      ok: false,
      blocked: true,
      blockedReason: "DEPARTMENT_BLOCK_AUTO_SEND=true",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "missing_resend_api_key" };
  }

  const branding = await resolveEmailBranding({
    orgId: args.orgId ?? null,
    subOrgId: args.subOrgId ?? null,
  });

  const rendered = await renderEmail({
    template: "approval-needed",
    branding,
    data: {
      departmentName: args.departmentName,
      channel: args.channel,
      fromIdentity: args.fromIdentity ?? null,
      subject: args.subject ?? null,
      preview: args.preview,
      approvalUrl: args.approvalUrl,
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

export function parseEmailRecipients(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.includes("@"));
}
