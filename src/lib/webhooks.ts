import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export type WebhookEvent =
  | "conversation.started"
  | "conversation.ended"
  | "lead.scored"
  | "action.executed"
  | "agent.updated"
  | "test";

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  agentId?: string;
  data: Record<string, unknown>;
}

function signPayload(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

async function deliverWebhook(
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);
  const start = Date.now();

  let statusCode: number | null = null;
  let success = false;
  let error: string | null = null;

  // Erster Versuch
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KILN-Signature": signature,
        "X-KILN-Event": payload.event,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    statusCode = res.status;
    success = res.status >= 200 && res.status < 300;
  } catch (err) {
    error = err instanceof Error ? err.message : "Delivery failed";
  }

  // Retry einmal bei Fehler
  if (!success) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KILN-Signature": signature,
          "X-KILN-Event": payload.event,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      statusCode = res.status;
      success = res.status >= 200 && res.status < 300;
      if (success) error = null;
    } catch (retryErr) {
      error = retryErr instanceof Error ? retryErr.message : "Retry failed";
    }
  }

  const responseTime = Date.now() - start;

  // Delivery Log speichern
  await prisma.webhookDelivery.create({
    data: {
      webhookId,
      event: payload.event,
      statusCode,
      responseTime,
      success,
      error,
    },
  }).catch(() => {});
}

// Fire-and-forget: Events an alle matching Webhooks senden
export function fireWebhookEvent(
  userId: string,
  event: WebhookEvent,
  agentId: string | undefined,
  data: Record<string, unknown>
): void {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    agentId,
    data,
  };

  // Asynchron — blockiert nicht den Hauptfluss
  prisma.webhookEndpoint
    .findMany({
      where: {
        userId,
        active: true,
      },
    })
    .then((webhooks) => {
      for (const wh of webhooks) {
        const events = wh.events as string[];
        if (events.includes(event)) {
          deliverWebhook(wh.id, wh.url, wh.secret, payload).catch(() => {});
        }
      }
    })
    .catch(() => {});
}

// Direkt-Zustellung für Test-Button
export async function sendTestWebhook(
  webhookId: string,
  url: string,
  secret: string
): Promise<{ success: boolean; statusCode: number | null; error: string | null }> {
  const payload: WebhookPayload = {
    event: "test",
    timestamp: new Date().toISOString(),
    data: { message: "This is a test webhook from KILN." },
  };

  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);

  let statusCode: number | null = null;
  let success = false;
  let error: string | null = null;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KILN-Signature": signature,
        "X-KILN-Event": "test",
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    statusCode = res.status;
    success = res.status >= 200 && res.status < 300;
  } catch (err) {
    error = err instanceof Error ? err.message : "Delivery failed";
  }

  const responseTime = Date.now() - start;

  await prisma.webhookDelivery.create({
    data: {
      webhookId,
      event: "test",
      statusCode,
      responseTime,
      success,
      error,
    },
  }).catch(() => {});

  return { success, statusCode, error };
}
