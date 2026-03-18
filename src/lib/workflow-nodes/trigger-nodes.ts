/**
 * Trigger Node Executors
 * Trigger-Nodes starten eine Workflow-Execution.
 * Sie produzieren den initialen Kontext aus den Trigger-Daten.
 */

import type { WorkflowNodeType } from "@/lib/workflow-node-types";
import type { ExpressionContext } from "@/lib/workflow-expressions";

export interface TriggerPayload {
  type: WorkflowNodeType;
  data: Record<string, unknown>;
  timestamp: string;
  source?: string;
}

export interface TriggerResult {
  context: ExpressionContext;
  triggerType: string;
  meta?: Record<string, unknown>;
}

/* ── Webhook Trigger ── */

export function executeWebhookTrigger(
  config: Record<string, unknown>,
  payload: Record<string, unknown>
): TriggerResult {
  // Webhook liefert den Body als initialen Kontext
  return {
    context: {
      trigger: {
        type: "webhook",
        method: config.method || "POST",
        path: config.path || "",
        receivedAt: new Date().toISOString(),
      },
      webhook: payload,
      // Flache Kopie der Top-Level-Felder für einfachen Zugriff
      ...flattenTopLevel(payload),
    },
    triggerType: "trigger_webhook",
  };
}

/* ── Schedule Trigger ── */

export function executeScheduleTrigger(
  config: Record<string, unknown>
): TriggerResult {
  return {
    context: {
      trigger: {
        type: "schedule",
        cron: config.cron || "0 9 * * *",
        timezone: config.timezone || "Europe/Berlin",
        firedAt: new Date().toISOString(),
      },
    },
    triggerType: "trigger_schedule",
  };
}

/* ── Lead Captured Trigger ── */

export function executeLeadTrigger(
  config: Record<string, unknown>,
  leadData: Record<string, unknown>
): TriggerResult {
  return {
    context: {
      trigger: {
        type: "lead",
        agentFilter: config.agentFilter || "all",
        capturedAt: new Date().toISOString(),
      },
      lead: leadData,
      // Flache Kopie für einfachen Zugriff: {{ email }}, {{ name }}
      ...flattenTopLevel(leadData),
    },
    triggerType: "trigger_lead",
  };
}

/* ── Chat Started Trigger ── */

export function executeChatTrigger(
  config: Record<string, unknown>,
  chatData: Record<string, unknown>
): TriggerResult {
  return {
    context: {
      trigger: {
        type: "chat",
        agentFilter: config.agentFilter || "all",
        startedAt: new Date().toISOString(),
      },
      chat: chatData,
      ...flattenTopLevel(chatData),
    },
    triggerType: "trigger_chat",
  };
}

/* ── Manual Trigger ── */

export function executeManualTrigger(
  inputData?: Record<string, unknown>
): TriggerResult {
  return {
    context: {
      trigger: {
        type: "manual",
        triggeredAt: new Date().toISOString(),
      },
      ...(inputData ? flattenTopLevel(inputData) : {}),
    },
    triggerType: "trigger_manual",
  };
}

/* ── Helper ── */

function flattenTopLevel(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Nur primitive Werte und Arrays flach kopieren
    if (typeof value !== "object" || Array.isArray(value) || value === null) {
      result[key] = value;
    }
  }
  return result;
}

/* ── Dispatcher ── */

export function executeTriggerNode(
  nodeType: WorkflowNodeType,
  config: Record<string, unknown>,
  payload?: Record<string, unknown>
): TriggerResult {
  switch (nodeType) {
    case "trigger_webhook":
      return executeWebhookTrigger(config, payload || {});
    case "trigger_schedule":
      return executeScheduleTrigger(config);
    case "trigger_lead":
      return executeLeadTrigger(config, payload || {});
    case "trigger_chat":
      return executeChatTrigger(config, payload || {});
    case "trigger_manual":
      return executeManualTrigger(payload);
    default:
      throw new Error(`Unbekannter Trigger-Typ: ${nodeType}`);
  }
}
