import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { sendSlackMessage } from "@/lib/integrations/slack";

export interface SlackNotifyArgs {
  userId: string;
  orgId: string | null;
  slackChannel: string;
  text: string;
}

export interface SlackNotifyResult {
  ok: boolean;
  error?: string;
  ts?: string;
}

export async function sendSlackApprovalNotification(
  args: SlackNotifyArgs
): Promise<SlackNotifyResult> {
  const connection = await prisma.integrationConnection.findFirst({
    where: { userId: args.userId, provider: "slack", isActive: true },
  });

  if (!connection || !connection.isActive) {
    return { ok: false, error: "no_slack_integration" };
  }

  let accessToken: string;
  try {
    const config = JSON.parse(decrypt(connection.config)) as {
      accessToken?: string;
    };
    if (!config.accessToken) {
      return { ok: false, error: "missing_access_token" };
    }
    accessToken = config.accessToken;
  } catch {
    return { ok: false, error: "decrypt_failed" };
  }

  try {
    const result = await sendSlackMessage(
      accessToken,
      args.slackChannel,
      args.text
    );
    if (!result.ok) {
      return { ok: false, error: result.error || "slack_api_error" };
    }
    return { ok: true, ts: result.ts };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

export function buildApprovalSlackText(args: {
  departmentName: string;
  channel: string;
  from: string | null | undefined;
  subject: string | null | undefined;
  preview: string;
  approvalUrl: string;
}): string {
  const fromLine = args.from ? `From: ${args.from}\n` : "";
  const subjectLine = args.subject ? `Subject: "${args.subject}"\n` : "";
  return [
    `🔔 Department: ${args.departmentName}`,
    `1 draft needs your approval`,
    ``,
    `Channel: ${args.channel}`,
    `${fromLine}${subjectLine}`.trim(),
    ``,
    `Drafted reply preview:`,
    `> ${truncatePreview(args.preview)}`,
    ``,
    `Open in KILN: ${args.approvalUrl}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function truncatePreview(text: string): string {
  const trimmed = text.trim().replace(/\n+/g, " ");
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}...` : trimmed;
}
