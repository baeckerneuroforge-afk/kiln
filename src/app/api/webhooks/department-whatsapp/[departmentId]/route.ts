import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { enqueueTask } from "@/lib/departments/backlog";
import { runManagerLoop } from "@/lib/departments/department-engine";
import { isInboundAllowed, verifyMetaSignature } from "@/lib/departments/channels/safety";
import { logDepartmentChannelEvent } from "@/lib/departments/channels/logging";
import { identifyCustomer } from "@/lib/customer-memory/identifier";
import { recordInteraction } from "@/lib/customer-memory/writer";

interface WhatsappMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string };
  document?: { id?: string };
}

interface WhatsappPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsappMessage[];
        metadata?: { phone_number_id?: string };
      };
    }>;
  }>;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { departmentId: string } }
) {
  try {
    const rawBody = await request.text();
    const validSignature = await verifyMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256")
    );
    if (!validSignature) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as WhatsappPayload;
    const department = await prisma.department.findUnique({
      where: { id: params.departmentId },
      select: { id: true, whatsappEnabled: true, status: true, orgId: true },
    });
    if (!department || !department.whatsappEnabled) {
      return Response.json({ ok: true });
    }

    const messages = extractMessages(payload);
    for (const message of messages) {
    const from = String(message.from || "").trim();
    const body = String(message.text?.body || "").trim();
    const type = String(message.type || "unknown");
    const mediaId = message.image?.id || message.document?.id;
    const to = message.phoneNumberId || "";

    if (!from) continue;
    if (!isInboundAllowed(from)) {
      console.log("[department-whatsapp] inbound ignored by allowlist", {
        departmentId: department.id,
        from,
      });
      await logDepartmentChannelEvent({
        departmentId: department.id,
        event: "inbound_ignored_allowlist",
        channel: "WHATSAPP",
        sender: from,
        status: "BLOCKED",
        blocked: true,
      });
      continue;
    }

    const customer = department.orgId
      ? await identifyCustomer({
          orgId: department.orgId,
          phone: from,
        }).catch((err) => {
          console.warn("[department-whatsapp] customer identification failed", err);
          return null;
        })
      : null;

    const channelMessage = await prisma.departmentChannelMessage.create({
      data: {
        departmentId: department.id,
        channel: "WHATSAPP",
        direction: "INBOUND",
        whatsappMessageId: message.id,
        whatsappFrom: from,
        whatsappTo: to,
        whatsappBody: body,
        whatsappType: type,
        whatsappMediaId: mediaId,
        status: "RECEIVED",
        customerProfileId: customer?.id ?? null,
      },
    });

    const backlogItem = await enqueueTask({
      departmentId: department.id,
      triggerType: "WEBHOOK",
      triggerPayload: {
        channel: "WHATSAPP",
        channelMessageId: channelMessage.id,
        customerProfileId: customer?.id ?? null,
        from,
        to,
        body,
        messageId: message.id,
        messageType: type,
        mediaId,
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
        summary: `WhatsApp-Nachricht: ${(body || "[Medien]").slice(0, 200)}`,
        type: "INTERACTION",
        source: "CONVERSATION",
        sourceId: channelMessage.id,
        departmentId: department.id,
        importance: 5,
      }).catch((err) => {
        console.warn("[department-whatsapp] recordInteraction failed", err);
      });
    }

    await logDepartmentChannelEvent({
      departmentId: department.id,
      backlogItemId: backlogItem.id,
      event: "inbound_received",
      channel: "WHATSAPP",
      sender: from,
      recipient: to,
      status: "RECEIVED",
    });
  }

    waitUntil(runManagerLoop(department.id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[department-whatsapp] inbound webhook failed", error);
    return Response.json({ ok: true, accepted: false });
  }
}

function extractMessages(payload: WhatsappPayload): Array<WhatsappMessage & { phoneNumberId?: string }> {
  const messages: Array<WhatsappMessage & { phoneNumberId?: string }> = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      for (const message of change.value?.messages || []) {
        messages.push({ ...message, phoneNumberId });
      }
    }
  }
  return messages;
}
