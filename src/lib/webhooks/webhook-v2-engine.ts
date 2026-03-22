import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { validateUrl } from "@/lib/url-validation";
import type { EventType } from "@/lib/event-types";

// ── V2 Event Types (Superset der bestehenden EventTypes) ─────

export type WebhookV2EventType =
  | EventType
  // Agent events
  | "agent.created"
  | "agent.deleted"
  | "agent.deployed"
  // Workflow events
  | "workflow.created"
  | "workflow.deleted"
  // Computer Use events
  | "computer_use.session_started"
  | "computer_use.session_completed"
  | "computer_use.artifact_created"
  // Diff Detection events
  | "diff.change_detected"
  // Approval events
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  // Budget events
  | "budget.warning"
  | "budget.exceeded"
  // Health events
  | "health.degraded"
  | "health.recovered"
  // Collaboration events
  | "collaboration.message_received"
  | "collaboration.agent_connected"
  // MCP events
  | "mcp.connected"
  | "mcp.disconnected"
  | "mcp.tool_executed";

export const WEBHOOK_V2_EVENT_CATEGORIES: Record<string, WebhookV2EventType[]> = {
  "Conversations": [
    "conversation.started",
    "conversation.completed",
    "lead.captured",
    "appointment.booked",
  ],
  "Agents": [
    "agent.updated",
    "agent.created",
    "agent.deleted",
    "agent.deployed",
  ],
  "Tasks": [
    "task.completed",
    "task.failed",
  ],
  "Team / Workflows": [
    "team.execution.started",
    "team.execution.step_completed",
    "team.execution.approval_needed",
    "team.execution.completed",
    "team.execution.failed",
    "team.awaiting_approval",
    "team.completed",
    "workflow.created",
    "workflow.deleted",
  ],
  "Computer Use": [
    "computer_use.session_started",
    "computer_use.session_completed",
    "computer_use.artifact_created",
  ],
  "Monitoring": [
    "diff.change_detected",
    "health.degraded",
    "health.recovered",
    "budget.warning",
    "budget.exceeded",
    "credits.low",
  ],
  "Approvals": [
    "approval.requested",
    "approval.approved",
    "approval.rejected",
  ],
  "Collaboration & MCP": [
    "collaboration.message_received",
    "collaboration.agent_connected",
    "mcp.connected",
    "mcp.disconnected",
    "mcp.tool_executed",
  ],
};

export const ALL_V2_EVENT_TYPES: WebhookV2EventType[] = Object.values(
  WEBHOOK_V2_EVENT_CATEGORIES
).flat();

// ── Retry Schedule ───────────────────────────────────────────

const RETRY_DELAYS_MS = [
  30 * 1000,       // 30s
  5 * 60 * 1000,   // 5min
  30 * 60 * 1000,  // 30min
  2 * 60 * 60 * 1000, // 2h
];

const MAX_RETRIES = 4;
const DELIVERY_LOG_RETENTION_DAYS = 7;

// ── Signing ──────────────────────────────────────────────────

function signPayload(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// ── Webhook V2 Engine ────────────────────────────────────────

export interface WebhookV2Subscription {
  id: string;
  userId: string;
  url: string;
  events: string[];
  secret: string;
  headers?: Record<string, string>;
  isActive: boolean;
  failureCount: number;
  lastDeliveredAt: Date | null;
  lastFailedAt: Date | null;
}

export interface WebhookV2DeliveryLog {
  id: string;
  webhookSubscriptionId: string;
  eventType: string;
  requestUrl: string;
  responseCode: number | null;
  durationMs: number | null;
  status: string; // "success" | "failed" | "pending_retry"
  retryCount: number;
  createdAt: Date;
}

export class WebhookV2Engine {

  /**
   * Subscribe: Erstellt eine neue Webhook-Subscription.
   * Enhances existing WebhookEndpoint — speichert in gleicher Tabelle.
   */
  static async subscribe(
    userId: string,
    config: {
      url: string;
      events: string[];
      secret?: string;
      headers?: Record<string, string>;
    }
  ): Promise<WebhookV2Subscription> {
    // SSRF-Schutz
    const validation = await validateUrl(config.url);
    if (!validation.safe) {
      throw new Error(validation.error || "URL nicht erlaubt");
    }

    const secret = config.secret || crypto.randomBytes(32).toString("hex");

    const webhook = await prisma.webhookEndpoint.create({
      data: {
        userId,
        url: config.url,
        events: config.events,
        secret,
        active: true,
      },
    });

    return {
      id: webhook.id,
      userId: webhook.userId,
      url: webhook.url,
      events: webhook.events as string[],
      secret: webhook.secret,
      headers: config.headers,
      isActive: webhook.active,
      failureCount: 0,
      lastDeliveredAt: null,
      lastFailedAt: null,
    };
  }

  /**
   * Emit: Event an alle passenden Subscriptions senden.
   * Erweiterte Version von emitEvent() mit V2-Features.
   */
  static async emit(
    userId: string,
    eventType: WebhookV2EventType,
    data: Record<string, unknown>,
    agentId?: string
  ): Promise<void> {
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      agentId,
      data,
    };

    try {
      const webhooks = await prisma.webhookEndpoint.findMany({
        where: {
          userId,
          active: true,
        },
      });

      const matching = webhooks.filter((wh) => {
        const events = wh.events as string[];
        return events.includes(eventType) || events.includes("*");
      });

      if (matching.length === 0) return;

      await Promise.allSettled(
        matching.map((wh) =>
          this.deliverWithRetry(wh.id, wh.url, wh.secret, payload, 0)
        )
      );
    } catch (err) {
      console.error("WebhookV2 dispatch failed:", err);
    }
  }

  /**
   * Delivery mit Retry-Logik und ausführlichem Logging.
   */
  private static async deliverWithRetry(
    webhookId: string,
    url: string,
    secret: string,
    payload: Record<string, unknown>,
    retryCount: number
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = signPayload(body, secret);
    const start = Date.now();

    let statusCode: number | null = null;
    let success = false;
    let responseBody = "";
    let error: string | null = null;

    // SSRF-Schutz
    const validation = await validateUrl(url);
    if (!validation.safe) {
      await this.logDelivery(webhookId, payload, url, null, null, false, "SSRF blocked", 0, retryCount);
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KILN-Signature": signature,
          "X-KILN-Event": String(payload.event),
          "X-KILN-Delivery-Attempt": String(retryCount + 1),
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      statusCode = res.status;
      success = res.status >= 200 && res.status < 300;
      responseBody = await res.text().catch(() => "");
    } catch (err) {
      error = err instanceof Error ? err.message : "Delivery failed";
    }

    const durationMs = Date.now() - start;
    const _status = success ? "success" : retryCount < MAX_RETRIES ? "pending_retry" : "failed"; // eslint-disable-line @typescript-eslint/no-unused-vars

    // Log speichern
    await this.logDelivery(
      webhookId,
      payload,
      url,
      statusCode,
      responseBody.slice(0, 1000),
      success,
      error,
      durationMs,
      retryCount
    );

    // Bei Erfolg: Webhook aktualisieren
    if (success) {
      await prisma.webhookEndpoint.update({
        where: { id: webhookId },
        data: { active: true },
      }).catch(() => {});
      return;
    }

    // Bei Fehler: Retry oder endgültig fehlgeschlagen
    if (retryCount < MAX_RETRIES) {
      const nextRetryDelay = RETRY_DELAYS_MS[retryCount] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      // In Production würde man hier eine Queue nutzen.
      // Für jetzt: setTimeout für den nächsten Retry.
      setTimeout(() => {
        this.deliverWithRetry(webhookId, url, secret, payload, retryCount + 1).catch(() => {});
      }, nextRetryDelay);
    } else {
      // Max Retries erreicht — Webhook als fehlgeschlagen markieren
      Sentry.captureMessage("WebhookV2 delivery permanently failed", {
        level: "warning",
        tags: { component: "webhook-v2", webhookId },
        extra: { url, event: payload.event, error, statusCode, retryCount },
      });
    }
  }

  /**
   * Delivery Log in DB speichern.
   */
  private static async logDelivery(
    webhookId: string,
    payload: Record<string, unknown>,
    url: string,
    statusCode: number | null,
    responseBody: string | null,
    success: boolean,
    error: string | null,
    durationMs: number,
    retryCount: number // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<void> {
    // Wir nutzen die bestehende WebhookDelivery-Tabelle
    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event: String(payload.event),
        statusCode,
        responseTime: durationMs,
        success,
        error: error || (responseBody ? responseBody.slice(0, 500) : null),
      },
    }).catch((err) => {
      console.error("WebhookV2 delivery log failed:", err);
    });
  }

  /**
   * Alte Delivery-Logs aufräumen (7 Tage Retention).
   */
  static async cleanupDeliveryLogs(): Promise<number> {
    const cutoff = new Date(Date.now() - DELIVERY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.webhookDelivery.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });
    return result.count;
  }

  /**
   * Test-Event an einen spezifischen Webhook senden.
   */
  static async sendTestEvent(
    webhookId: string
  ): Promise<{ success: boolean; statusCode: number | null; error: string | null }> {
    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      return { success: false, statusCode: null, error: "Webhook nicht gefunden" };
    }

    const payload = {
      event: "test" as const,
      timestamp: new Date().toISOString(),
      data: { message: "Dies ist ein Test-Event von KILN." },
    };

    const body = JSON.stringify(payload);
    const signature = signPayload(body, webhook.secret);
    const start = Date.now();

    let statusCode: number | null = null;
    let success = false;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(webhook.url, {
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

    const durationMs = Date.now() - start;

    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event: "test",
        statusCode,
        responseTime: durationMs,
        success,
        error,
      },
    }).catch(() => {});

    return { success, statusCode, error };
  }
}
