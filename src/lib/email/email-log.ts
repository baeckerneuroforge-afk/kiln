/**
 * Sprint 19.7.8 — EmailLog persistence helper.
 *
 * `logEmailSend` is fire-and-forget from the caller's perspective: a
 * persistence failure here must NEVER bubble up and crash the email send
 * (we'd rather lose a log row than fail to deliver a transactional
 * email). Errors are logged to console for observability.
 *
 * Status values:
 *   SENT    — Resend accepted the request, externalId populated
 *   FAILED  — render or transport error; `errorMessage` populated
 *   SKIPPED — preference-gate refusal or missing API key in dev;
 *             `errorMessage` carries the reason code
 */
import { prisma } from "@/lib/prisma";
import type { EmailLogStatus, Prisma } from "@prisma/client";

export interface LogEmailSendArgs {
  userId?: string | null;
  orgId?: string | null;
  subOrgId?: string | null;
  template: string;
  recipientEmail: string;
  status: EmailLogStatus;
  externalId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logEmailSend(args: LogEmailSendArgs): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        userId: args.userId ?? null,
        orgId: args.orgId ?? null,
        subOrgId: args.subOrgId ?? null,
        template: args.template,
        recipientEmail: args.recipientEmail,
        status: args.status,
        externalId: args.externalId ?? null,
        errorMessage: args.errorMessage ?? null,
        metadata: (args.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("[email-log] failed to persist EmailLog row", err);
  }
}
