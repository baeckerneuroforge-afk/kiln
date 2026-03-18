import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { validateUrl } from "@/lib/url-validation";

// Re-export types for convenience
export type { EventType } from "@/lib/event-types";
export { ALL_EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/event-types";

import type { EventType } from "@/lib/event-types";

interface EventPayload {
  event: EventType;
  timestamp: string;
  agentId?: string;
  data: Record<string, unknown>;
}

function signPayload(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Deliver a single webhook with 1 retry on failure.
 * Uses validateUrl() for SSRF protection.
 */
async function deliverEvent(
  webhookId: string,
  url: string,
  secret: string,
  payload: EventPayload
): Promise<void> {
  // SSRF-Schutz
  const validation = await validateUrl(url);
  if (!validation.safe) {
    await logDelivery(webhookId, payload.event, null, false, validation.error || "SSRF blocked");
    return;
  }

  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);
  const headers = {
    "Content-Type": "application/json",
    "X-KILN-Signature": signature,
    "X-KILN-Event": payload.event,
  };
  const start = Date.now();

  let statusCode: number | null = null;
  let success = false;
  let error: string | null = null;

  // Erster Versuch
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    clearTimeout(timeout);
    statusCode = res.status;
    success = res.status >= 200 && res.status < 300;
  } catch (err) {
    error = err instanceof Error ? err.message : "Delivery failed";
  }

  // Retry bei Fehler
  if (!success) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
      clearTimeout(timeout);
      statusCode = res.status;
      success = res.status >= 200 && res.status < 300;
      if (success) error = null;
    } catch (retryErr) {
      error = retryErr instanceof Error ? retryErr.message : "Retry failed";
    }
  }

  if (!success) {
    Sentry.captureMessage("Event webhook delivery failed", {
      level: "warning",
      tags: { component: "event-delivery", webhookId },
      extra: { url, event: payload.event, error, statusCode },
    });
  }

  const responseTime = Date.now() - start;
  await logDelivery(webhookId, payload.event, statusCode, success, error, responseTime);
}

async function logDelivery(
  webhookId: string,
  event: string,
  statusCode: number | null,
  success: boolean,
  error?: string | null,
  responseTime?: number
) {
  await prisma.webhookDelivery.create({
    data: { webhookId, event, statusCode, responseTime: responseTime ?? null, success, error: error ?? null },
  }).catch((err) => {
    console.error("Event delivery log failed:", err);
  });
}

/**
 * Emit an event to all matching webhook subscriptions.
 * Looks up both user-level and agent-specific WebhookEndpoint records.
 * Designed to be called inside waitUntil() for non-blocking execution.
 */
export async function emitEvent(
  eventType: EventType,
  userId: string,
  agentId: string | undefined,
  data: Record<string, unknown>
): Promise<void> {
  const teamId = typeof data.teamId === "string" ? data.teamId : undefined;

  const payload: EventPayload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    agentId,
    data,
  };

  try {
    const orConditions: Array<Record<string, unknown>> = [
      { agentId: null, teamId: null },
    ];
    if (agentId) orConditions.push({ agentId });
    if (teamId) orConditions.push({ teamId });

    const webhooks = await prisma.webhookEndpoint.findMany({
      where: {
        userId,
        active: true,
        OR: orConditions,
      },
    });

    const matching = webhooks.filter((wh) =>
      (wh.events as string[]).includes(eventType)
    );

    if (matching.length === 0) return;

    await Promise.allSettled(
      matching.map((wh) =>
        deliverEvent(wh.id, wh.url, wh.secret, payload).catch((err) => {
          console.error("Event delivery failed:", err);
        })
      )
    );
  } catch (err) {
    console.error("Event dispatch failed:", err);
  }
}
