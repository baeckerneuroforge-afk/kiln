import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { enqueueTask } from "@/lib/departments/backlog";
import { runManagerLoop } from "@/lib/departments/department-engine";
import { toPrismaJson } from "@/lib/departments/json";
import {
  isInboundAllowed,
  stripHtml,
  verifyInboundEmailAuth,
} from "@/lib/departments/channels/safety";
import { logDepartmentChannelEvent } from "@/lib/departments/channels/logging";
import { identifyCustomer } from "@/lib/customer-memory/identifier";
import { recordInteraction } from "@/lib/customer-memory/writer";
import { startTracking, checkOpenTrackings } from "@/lib/sla/tracker";
import { dispatchSlaEscalation } from "@/lib/sla/notifications";

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
    const rawBody = await request.text();
    const auth = verifyInboundEmailAuth({
      rawBody,
      svixId: request.headers.get("svix-id"),
      svixTimestamp: request.headers.get("svix-timestamp"),
      svixSignature: request.headers.get("svix-signature"),
      customSecret: request.headers.get("x-kiln-webhook-secret"),
    });
    if (!auth.ok) {
      console.warn("[department-email] inbound rejected", {
        departmentId: params.departmentId,
        reason: auth.reason,
      });
      return Response.json({ error: auth.reason }, { status: 401 });
    }

    let payload: ResendInboundPayload;
    try {
      payload = JSON.parse(rawBody) as ResendInboundPayload;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const from = String(payload.from || "").trim();
    const to = String(payload.to || "").trim();
    const subject = String(payload.subject || "(No Subject)");
    const body = String(payload.text || "").trim() || stripHtml(String(payload.html || ""));

    const department = await prisma.department.findUnique({
      where: { id: params.departmentId },
      select: { id: true, emailEnabled: true, status: true, orgId: true },
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

    const customer = department.orgId
      ? await identifyCustomer({
          orgId: department.orgId,
          email: from,
          name: extractDisplayName(from),
        }).catch((err) => {
          console.warn("[department-email] customer identification failed", err);
          return null;
        })
      : null;

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
        customerProfileId: customer?.id ?? null,
      },
    });

    const backlogItem = await enqueueTask({
      departmentId: department.id,
      triggerType: "WEBHOOK",
      triggerPayload: {
        channel: "EMAIL",
        channelMessageId: channelMessage.id,
        customerProfileId: customer?.id ?? null,
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

    if (customer) {
      await recordInteraction({
        customerProfileId: customer.id,
        summary: `Email-Anfrage: ${subject}`.slice(0, 1_000),
        type: "INTERACTION",
        source: "CONVERSATION",
        sourceId: channelMessage.id,
        departmentId: department.id,
        importance: 5,
      }).catch((err) => {
        console.warn("[department-email] recordInteraction failed", err);
      });
    }

    if (department.orgId) {
      await startTracking({
        conversationId: backlogItem.id,
        channelMessageId: channelMessage.id,
        customerProfileId: customer?.id ?? null,
        orgId: department.orgId,
        departmentId: department.id,
        matchInput: { channel: "EMAIL" },
      }).catch((err) => {
        console.warn("[department-email] startTracking failed", err);
        return null;
      });
      // Inline best-effort SLA check (workaround for hobby-plan cron limit).
      // Only inspects the last 24h to keep this fast (<200ms typical).
      checkOpenTrackings({ orgIds: [department.orgId], sinceHours: 24, notify: dispatchSlaEscalation }).catch((err) => {
        console.warn("[department-email] checkOpenTrackings failed", err);
      });
    }

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

function extractDisplayName(rawFrom: string): string | null {
  const match = rawFrom.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>/);
  if (match) return match[1].trim();
  return null;
}
