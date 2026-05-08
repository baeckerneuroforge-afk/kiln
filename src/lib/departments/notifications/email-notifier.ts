import { Resend } from "resend";
import { isDepartmentAutoSendBlocked } from "@/lib/departments/channels/safety";

export interface ApprovalEmailArgs {
  departmentName: string;
  recipients: string[];
  channel: string;
  fromIdentity: string | null | undefined;
  subject: string | null | undefined;
  preview: string;
  approvalUrl: string;
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

  const fromAddress =
    process.env.DEPARTMENT_NOTIFICATION_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    "KILN Notifications <noreply@kilnbase.com>";

  try {
    const resend = new Resend(apiKey);
    const subject = `[KILN] Approval needed — ${args.departmentName}`;
    const response = await resend.emails.send({
      from: fromAddress,
      to: args.recipients,
      subject,
      text: buildApprovalEmailText(args),
      html: buildApprovalEmailHtml(args),
    });
    return { ok: true, externalId: response.data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

export function buildApprovalEmailText(args: ApprovalEmailArgs): string {
  const fromLine = args.fromIdentity ? `From: ${args.fromIdentity}\n` : "";
  const subjectLine = args.subject ? `Subject: ${args.subject}\n` : "";
  return [
    `A new draft from ${args.departmentName} department needs your review.`,
    ``,
    `Channel: ${args.channel}`,
    `${fromLine}${subjectLine}`.trim(),
    ``,
    `Preview:`,
    args.preview,
    ``,
    `View Draft: ${args.approvalUrl}`,
    ``,
    `— KILN`,
  ].join("\n");
}

export function buildApprovalEmailHtml(args: ApprovalEmailArgs): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const fromLine = args.fromIdentity
    ? `<p><strong>From:</strong> ${escape(args.fromIdentity)}</p>`
    : "";
  const subjectLine = args.subject
    ? `<p><strong>Subject:</strong> ${escape(args.subject)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0C0A09;">
  <h2 style="margin: 0 0 16px;">Approval needed — ${escape(args.departmentName)}</h2>
  <p>A new draft needs your review.</p>
  <p><strong>Channel:</strong> ${escape(args.channel)}</p>
  ${fromLine}
  ${subjectLine}
  <div style="background: #f5f5f5; padding: 12px 16px; border-left: 3px solid #F97316; margin: 16px 0; white-space: pre-wrap;">${escape(args.preview)}</div>
  <p>
    <a href="${escape(args.approvalUrl)}" style="display: inline-block; background: #F97316; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Draft</a>
  </p>
  <p style="color: #666; font-size: 12px; margin-top: 32px;">— KILN</p>
</body>
</html>`;
}

export function parseEmailRecipients(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.includes("@"));
}
