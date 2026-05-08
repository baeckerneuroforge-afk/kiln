import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { isDepartmentAutoSendBlocked } from "./safety";
import { logDepartmentChannelEvent } from "./logging";

export interface DepartmentEmailSendResult {
  sent: boolean;
  blockedReason?: string;
  externalId?: string;
}

export async function sendDepartmentEmail(args: {
  departmentId: string;
  backlogItemId: string;
  to: string;
  subject: string;
  body: string;
  inReplyToMessageId?: string;
  approverUserId: string;
}): Promise<DepartmentEmailSendResult> {
  const department = await prisma.department.findUnique({
    where: { id: args.departmentId },
    select: {
      id: true,
      emailFromAddr: true,
      emailFromName: true,
      emailReplyToAddr: true,
    },
  });

  if (!department) throw new Error("Department not found");

  const fromAddress = department.emailFromAddr || department.emailReplyToAddr;
  if (!fromAddress) throw new Error("Department email from address is not configured");

  if (isDepartmentAutoSendBlocked()) {
    const blockedReason = "DEPARTMENT_BLOCK_AUTO_SEND=true";
    console.log("[department-email] blocked outbound", {
      departmentId: args.departmentId,
      backlogItemId: args.backlogItemId,
      to: args.to,
      subject: args.subject,
    });
    await createOutboundMessage({
      ...args,
      status: "BLOCKED",
      blockedReason,
      from: formatFromAddress(fromAddress, department.emailFromName),
    });
    await logDepartmentChannelEvent({
      departmentId: args.departmentId,
      backlogItemId: args.backlogItemId,
      event: "outbound_blocked",
      channel: "EMAIL",
      recipient: args.to,
      approverUserId: args.approverUserId,
      blocked: true,
      status: "BLOCKED",
    });
    return { sent: false, blockedReason };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const response = await resend.emails.send({
      from: formatFromAddress(fromAddress, department.emailFromName),
      to: args.to,
      subject: args.subject,
      text: args.body,
      replyTo: department.emailReplyToAddr || fromAddress,
      headers: args.inReplyToMessageId
        ? {
            "In-Reply-To": args.inReplyToMessageId,
            References: args.inReplyToMessageId,
          }
        : undefined,
    });

    const externalId = response.data?.id;
    await createOutboundMessage({
      ...args,
      status: "SENT",
      externalId,
      from: formatFromAddress(fromAddress, department.emailFromName),
    });
    await logDepartmentChannelEvent({
      departmentId: args.departmentId,
      backlogItemId: args.backlogItemId,
      event: "outbound_sent",
      channel: "EMAIL",
      recipient: args.to,
      approverUserId: args.approverUserId,
      status: "SENT",
      payload: { externalId },
    });
    return { sent: true, externalId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await createOutboundMessage({
      ...args,
      status: "FAILED",
      errorMessage,
      from: formatFromAddress(fromAddress, department.emailFromName),
    });
    await logDepartmentChannelEvent({
      departmentId: args.departmentId,
      backlogItemId: args.backlogItemId,
      event: "outbound_failed",
      channel: "EMAIL",
      recipient: args.to,
      approverUserId: args.approverUserId,
      status: "FAILED",
      error: errorMessage,
    });
    throw error;
  }
}

function formatFromAddress(email: string, name?: string | null) {
  return name ? `${name} <${email}>` : email;
}

async function createOutboundMessage(args: {
  departmentId: string;
  backlogItemId: string;
  to: string;
  subject: string;
  body: string;
  from: string;
  status: "SENT" | "BLOCKED" | "FAILED";
  blockedReason?: string;
  externalId?: string;
  errorMessage?: string;
}) {
  await prisma.departmentChannelMessage.create({
    data: {
      departmentId: args.departmentId,
      backlogItemId: args.backlogItemId,
      channel: "EMAIL",
      direction: "OUTBOUND",
      emailFrom: args.from,
      emailTo: args.to,
      emailSubject: args.subject,
      emailBody: args.body,
      status: args.status,
      blockedReason: args.blockedReason,
      errorMessage: args.errorMessage,
      externalId: args.externalId,
      sentAt: args.status === "SENT" ? new Date() : null,
    },
  });
}
