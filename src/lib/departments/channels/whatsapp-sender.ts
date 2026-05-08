import { prisma } from "@/lib/prisma";
import { isDepartmentAutoSendBlocked, isWithinWhatsapp24HourWindow } from "./safety";
import { logDepartmentChannelEvent } from "./logging";

export interface DepartmentWhatsappSendResult {
  sent: boolean;
  blockedReason?: string;
  externalId?: string;
}

export async function sendDepartmentWhatsapp(args: {
  departmentId: string;
  backlogItemId: string;
  to: string;
  body: string;
  approverUserId: string;
}): Promise<DepartmentWhatsappSendResult> {
  const department = await prisma.department.findUnique({
    where: { id: args.departmentId },
    select: { whatsappPhoneId: true },
  });
  if (!department) throw new Error("Department not found");
  if (!department.whatsappPhoneId) throw new Error("WhatsApp phone number ID is not configured");

  const windowCheck = await checkWhatsappWindow(args.departmentId, args.to);
  if (!windowCheck.allowed) {
    return blockWhatsapp(args, windowCheck.reason);
  }

  if (isDepartmentAutoSendBlocked()) {
    return blockWhatsapp(args, "DEPARTMENT_BLOCK_AUTO_SEND=true");
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${department.whatsappPhoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: args.to,
          type: "text",
          text: { body: args.body },
        }),
      }
    );

    const payload = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message || "WhatsApp send failed");
    }

    const externalId = payload.messages?.[0]?.id;
    await createWhatsappMessage({ ...args, status: "SENT", externalId });
    await logDepartmentChannelEvent({
      departmentId: args.departmentId,
      backlogItemId: args.backlogItemId,
      event: "outbound_sent",
      channel: "WHATSAPP",
      recipient: args.to,
      approverUserId: args.approverUserId,
      status: "SENT",
      payload: { externalId },
    });
    return { sent: true, externalId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await createWhatsappMessage({ ...args, status: "FAILED", errorMessage });
    await logDepartmentChannelEvent({
      departmentId: args.departmentId,
      backlogItemId: args.backlogItemId,
      event: "outbound_failed",
      channel: "WHATSAPP",
      recipient: args.to,
      approverUserId: args.approverUserId,
      status: "FAILED",
      error: errorMessage,
    });
    throw error;
  }
}

export async function checkWhatsappWindow(
  departmentId: string,
  phone: string
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const lastInbound = await prisma.departmentChannelMessage.findFirst({
    where: {
      departmentId,
      channel: "WHATSAPP",
      direction: "INBOUND",
      whatsappFrom: phone,
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (isWithinWhatsapp24HourWindow(lastInbound?.createdAt || null)) {
    return { allowed: true };
  }

  return { allowed: false, reason: "Outside 24h window — template required" };
}

async function blockWhatsapp(
  args: {
    departmentId: string;
    backlogItemId: string;
    to: string;
    body: string;
    approverUserId: string;
  },
  blockedReason: string
): Promise<DepartmentWhatsappSendResult> {
  console.log("[department-whatsapp] blocked outbound", {
    departmentId: args.departmentId,
    backlogItemId: args.backlogItemId,
    to: args.to,
    blockedReason,
  });
  await createWhatsappMessage({ ...args, status: "BLOCKED", blockedReason });
  await logDepartmentChannelEvent({
    departmentId: args.departmentId,
    backlogItemId: args.backlogItemId,
    event: "outbound_blocked",
    channel: "WHATSAPP",
    recipient: args.to,
    approverUserId: args.approverUserId,
    blocked: true,
    status: "BLOCKED",
    payload: { blockedReason },
  });
  return { sent: false, blockedReason };
}

async function createWhatsappMessage(args: {
  departmentId: string;
  backlogItemId: string;
  to: string;
  body: string;
  status: "SENT" | "BLOCKED" | "FAILED";
  blockedReason?: string;
  externalId?: string;
  errorMessage?: string;
}) {
  await prisma.departmentChannelMessage.create({
    data: {
      departmentId: args.departmentId,
      backlogItemId: args.backlogItemId,
      channel: "WHATSAPP",
      direction: "OUTBOUND",
      whatsappTo: args.to,
      whatsappBody: args.body,
      whatsappType: "text",
      status: args.status,
      blockedReason: args.blockedReason,
      errorMessage: args.errorMessage,
      externalId: args.externalId,
      sentAt: args.status === "SENT" ? new Date() : null,
    },
  });
}
