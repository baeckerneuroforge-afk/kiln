import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { enqueueTask } from "@/lib/departments/backlog";
import { runManagerLoop } from "@/lib/departments/department-engine";
import { toPrismaJson } from "@/lib/departments/json";
import { isInboundAllowed, stripHtml } from "@/lib/departments/channels/safety";
import { logDepartmentChannelEvent } from "@/lib/departments/channels/logging";

interface ResendInboundPayload {
  from?: string;
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  messageId?: string;
  headers?: Record<string, unknown>;
  attachments?: Array<Record<string, unknown>>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { departmentId: string } }
) {
  try {
    const payload = (await request.json().catch(() => ({}))) as ResendInboundPayload;
    const from = String(payload.from || "").trim();
    const to = String(payload.to || "").trim();
    const subject = String(payload.subject || "(No Subject)");
    const body = String(payload.text || "").trim() || stripHtml(String(payload.html || ""));

    const department = await prisma.department.findUnique({
      where: { id: params.departmentId },
      select: { id: true, emailEnabled: true, status: true },
    });

    if (!department || !department.emailEnabled || !from || !body) {
      return Response.json({ ok: true });
    }

    if (!isInboundAllowed(from)) {
      console.log("[department-email] inbound ignored by allowlist", {
        departmentId: params.departmentId,
        from,
      });
      await logDepartmentChannelEvent({
        departmentId: params.departmentId,
        event: "inbound_ignored_allowlist",
        channel: "EMAIL",
        sender: from,
        status: "BLOCKED",
        blocked: true,
      });
      return Response.json({ ok: true, ignored: true });
    }

    const channelMessage = await prisma.departmentChannelMessage.create({
      data: {
        departmentId: department.id,
        channel: "EMAIL",
        direction: "INBOUND",
        emailMessageId: payload.messageId,
        emailFrom: from,
        emailTo: to,
        emailSubject: subject,
        emailHeaders: payload.headers ? toPrismaJson(payload.headers) : undefined,
        emailBody: body,
        status: "RECEIVED",
      },
    });

    const backlogItem = await enqueueTask({
      departmentId: department.id,
      triggerType: "WEBHOOK",
      triggerPayload: {
        channel: "EMAIL",
        channelMessageId: channelMessage.id,
        from,
        to,
        subject,
        body,
        messageId: payload.messageId,
        receivedAt: new Date().toISOString(),
      },
    });

    await prisma.departmentChannelMessage.update({
      where: { id: channelMessage.id },
      data: { backlogItemId: backlogItem.id },
    });

    await logDepartmentChannelEvent({
      departmentId: department.id,
      backlogItemId: backlogItem.id,
      event: "inbound_received",
      channel: "EMAIL",
      sender: from,
      recipient: to,
      status: "RECEIVED",
    });

    waitUntil(runManagerLoop(department.id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[department-email] inbound webhook failed", error);
    return Response.json({ ok: true, accepted: false });
  }
}
