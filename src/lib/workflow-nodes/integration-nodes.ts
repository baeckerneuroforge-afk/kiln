/**
 * Integration Node Executors
 * Führen Aktionen über verbundene Integrationen aus:
 * Google Sheets, Gmail, Slack, Calendar, Notion, Airtable.
 *
 * Alle Nodes benötigen eine aktive IntegrationConnection des Users.
 */

import {
  resolveExpression,
  resolveExpressionDeep,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";
import { executeDataQuery } from "./data-pipeline-node";
import {
  classifyWorkflowError,
  recordDeadLetter,
  runWithRetry,
  type WorkflowErrorType,
} from "@/lib/workflows/error-handling";
import { pickMockData } from "@/lib/workflows/mock-data";

/* ── Helper: userId aus Context extrahieren ── */

function getUserId(context: ExpressionContext): string {
  const userId = context._userId;
  if (typeof userId !== "string" || !userId) {
    throw new Error("Integration-Nodes benötigen einen authentifizierten User (_userId im Context)");
  }
  return userId;
}

/* ── Google Sheets Read ── */

export async function executeGoogleSheetsRead(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const userId = getUserId(context);
  const spreadsheetId = resolveExpression(String(config.spreadsheetId || ""), context);
  const range = resolveExpression(String(config.range || "Sheet1!A:Z"), context);
  const resultKey = String(config.resultKey || "sheetsData");

  if (!spreadsheetId) {
    return { contextDelta: {}, success: false, error: "Spreadsheet-ID fehlt" };
  }

  try {
    const { getGoogleSheetsIntegrationForUser } = await import("@/lib/integrations/google-sheets");
    const integration = await getGoogleSheetsIntegrationForUser(userId);
    if (!integration) {
      return { contextDelta: {}, success: false, error: "Google Sheets nicht verbunden. Bitte zuerst im Integration Hub verbinden." };
    }

    const data = await integration.integration.readRange(spreadsheetId, range);

    return {
      contextDelta: {
        [resultKey]: {
          spreadsheetId,
          range,
          values: data,
          rowCount: Array.isArray(data) ? data.length : 0,
        },
      },
      success: true,
      meta: { spreadsheetId, range, rowCount: Array.isArray(data) ? data.length : 0 },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Google Sheets Lesen fehlgeschlagen",
      meta: { spreadsheetId, range },
    };
  }
}

/* ── Google Sheets Write ── */

export async function executeGoogleSheetsWrite(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const userId = getUserId(context);
  const spreadsheetId = resolveExpression(String(config.spreadsheetId || ""), context);
  const range = resolveExpression(String(config.range || "Sheet1"), context);
  const rawValues = resolveExpressionDeep(config.values, context);

  if (!spreadsheetId) {
    return { contextDelta: {}, success: false, error: "Spreadsheet-ID fehlt" };
  }

  // values kann ein Array von Strings sein oder ein verschachteltes Array
  let values: string[];
  if (Array.isArray(rawValues)) {
    values = rawValues.map((v) => String(v ?? ""));
  } else if (typeof rawValues === "string") {
    values = rawValues.split(",").map((v) => v.trim());
  } else {
    return { contextDelta: {}, success: false, error: "Werte müssen ein Array oder komma-separierter String sein" };
  }

  try {
    const { getGoogleSheetsIntegrationForUser } = await import("@/lib/integrations/google-sheets");
    const integration = await getGoogleSheetsIntegrationForUser(userId);
    if (!integration) {
      return { contextDelta: {}, success: false, error: "Google Sheets nicht verbunden" };
    }

    await integration.integration.appendRow(spreadsheetId, range, values);

    return {
      contextDelta: {
        sheetsWriteResult: {
          spreadsheetId,
          range,
          valuesWritten: values.length,
          writtenAt: new Date().toISOString(),
        },
      },
      success: true,
      meta: { spreadsheetId, range, valuesWritten: values.length },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Google Sheets Schreiben fehlgeschlagen",
      meta: { spreadsheetId, range },
    };
  }
}

/* ── Gmail Send ── */

export async function executeGmailSend(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const userId = getUserId(context);
  const to = resolveExpression(String(config.to || ""), context);
  const subject = resolveExpression(String(config.subject || ""), context);
  const body = resolveExpression(String(config.body || ""), context);
  const replyToMessageId = config.replyToMessageId
    ? resolveExpression(String(config.replyToMessageId), context)
    : undefined;

  if (!to || !subject) {
    return { contextDelta: {}, success: false, error: "Empfänger und Betreff sind erforderlich" };
  }

  try {
    const { getGmailIntegrationForUser } = await import("@/lib/integrations/gmail");
    const integration = await getGmailIntegrationForUser(userId);
    if (!integration) {
      return { contextDelta: {}, success: false, error: "Gmail nicht verbunden. Bitte zuerst im Integration Hub verbinden." };
    }

    const result = await integration.integration.sendEmail(to, subject, body, replyToMessageId || undefined);

    return {
      contextDelta: {
        gmailSent: {
          messageId: result.id,
          to,
          subject,
          sentAt: new Date().toISOString(),
        },
      },
      success: true,
      meta: { to, subject, messageId: result.id },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Gmail Versand fehlgeschlagen",
      meta: { to, subject },
    };
  }
}

/* ── Slack Send (via OAuth Integration) ── */

export async function executeSlackSendIntegration(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const userId = getUserId(context);
  const channel = resolveExpression(String(config.channel || ""), context);
  const message = resolveExpression(String(config.message || ""), context);
  const threadTs = config.threadTs
    ? resolveExpression(String(config.threadTs), context)
    : undefined;

  if (!channel || !message) {
    return { contextDelta: {}, success: false, error: "Channel und Nachricht sind erforderlich" };
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const { readConfigJson } = await import("@/lib/integrations/config-storage");
    const { sendSlackMessage } = await import("@/lib/integrations/slack");

    const connection = await prisma.integrationConnection.findFirst({
      where: { userId, provider: "slack", isActive: true },
    });
    if (!connection) {
      return { contextDelta: {}, success: false, error: "Slack nicht verbunden. Bitte zuerst im Integration Hub verbinden." };
    }

    const slackConfig = readConfigJson<{ accessToken: string }>(connection.config).data;
    const result = await sendSlackMessage(slackConfig.accessToken, channel, message, threadTs || undefined);

    return {
      contextDelta: {
        slackSent: {
          channel,
          messageTs: result.ts,
          sentAt: new Date().toISOString(),
        },
      },
      success: true,
      meta: { channel, messageTs: result.ts },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Slack Nachricht fehlgeschlagen",
      meta: { channel },
    };
  }
}

/* ── Calendar Create ── */

export async function executeCalendarCreate(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const userId = getUserId(context);
  const title = resolveExpression(String(config.title || ""), context);
  const start = resolveExpression(String(config.start || ""), context);
  const end = resolveExpression(String(config.end || ""), context);
  const description = config.description ? resolveExpression(String(config.description), context) : undefined;
  const attendeeEmail = config.attendeeEmail ? resolveExpression(String(config.attendeeEmail), context) : undefined;
  const timezone = String(config.timezone || "Europe/Berlin");

  if (!title || !start || !end) {
    return { contextDelta: {}, success: false, error: "Titel, Start und Ende sind erforderlich" };
  }

  try {
    const { getGoogleCalendarIntegrationForUser } = await import("@/lib/integrations/google-calendar");
    const calIntegration = await getGoogleCalendarIntegrationForUser(userId);
    if (!calIntegration) {
      return { contextDelta: {}, success: false, error: "Google Calendar nicht verbunden" };
    }

    const calendarId = calIntegration.config.selectedCalendarId || "primary";
    const event = await calIntegration.integration.createEvent(calendarId, {
      title,
      start,
      end,
      description,
      attendeeEmail: attendeeEmail || null,
      timezone,
    });

    return {
      contextDelta: {
        calendarEvent: {
          eventId: event.id,
          htmlLink: event.htmlLink,
          title: event.summary,
          start: event.start,
          end: event.end,
          createdAt: new Date().toISOString(),
        },
      },
      success: true,
      meta: { eventId: event.id, title, start, end },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Termin-Erstellung fehlgeschlagen",
      meta: { title, start, end },
    };
  }
}

/* ── Calendar Check (Verfügbarkeit) ── */

export async function executeCalendarCheck(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const userId = getUserId(context);
  const startDate = resolveExpression(String(config.startDate || ""), context);
  const endDate = resolveExpression(String(config.endDate || ""), context);
  const slotMinutes = Number(config.slotMinutes) || 30;
  const dayStartHour = Number(config.dayStartHour) ?? 9;
  const dayEndHour = Number(config.dayEndHour) ?? 17;
  const resultKey = String(config.resultKey || "availableSlots");

  if (!startDate || !endDate) {
    return { contextDelta: {}, success: false, error: "Start- und End-Datum sind erforderlich" };
  }

  try {
    const { getGoogleCalendarIntegrationForUser } = await import("@/lib/integrations/google-calendar");
    const calIntegration = await getGoogleCalendarIntegrationForUser(userId);
    if (!calIntegration) {
      return { contextDelta: {}, success: false, error: "Google Calendar nicht verbunden" };
    }

    const calendarId = calIntegration.config.selectedCalendarId || "primary";
    const slots = await calIntegration.integration.getAvailableSlots(calendarId, {
      start: startDate,
      end: endDate,
      slotMinutes,
      dayStartHour,
      dayEndHour,
    });

    return {
      contextDelta: {
        [resultKey]: {
          slots,
          slotCount: slots.length,
          startDate,
          endDate,
        },
      },
      success: true,
      meta: { slotCount: slots.length, startDate, endDate },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Verfügbarkeitsprüfung fehlgeschlagen",
    };
  }
}

/* ── Notion Create ── */

export async function executeNotionCreate(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const userId = getUserId(context);
  const databaseId = resolveExpression(String(config.databaseId || ""), context);
  const rawProperties = resolveExpressionDeep(config.properties || {}, context) as Record<string, unknown>;
  const content = config.content ? resolveExpression(String(config.content), context) : undefined;

  if (!databaseId) {
    return { contextDelta: {}, success: false, error: "Notion Datenbank-ID fehlt" };
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const { decrypt } = await import("@/lib/encryption");
    const { createDatabaseEntry } = await import("@/lib/integrations/notion");

    const connection = await prisma.integrationConnection.findFirst({
      where: { userId, provider: "notion", isActive: true },
    });
    if (!connection) {
      return { contextDelta: {}, success: false, error: "Notion nicht verbunden" };
    }

    const notionConfig = JSON.parse(decrypt(connection.config)) as { accessToken: string };

    // Properties in Notion-Format konvertieren (vereinfachtes Mapping)
    const notionProperties = buildNotionProperties(rawProperties);

    const result = await createDatabaseEntry(
      notionConfig.accessToken,
      databaseId,
      notionProperties,
      content
    );

    return {
      contextDelta: {
        notionEntry: {
          pageId: result.id,
          url: result.url,
          databaseId,
          createdAt: new Date().toISOString(),
        },
      },
      success: true,
      meta: { pageId: result.id, url: result.url, databaseId },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Notion Eintrag fehlgeschlagen",
      meta: { databaseId },
    };
  }
}

/**
 * Vereinfachtes Property-Mapping: Keys werden als Notion-Properties interpretiert.
 * Format: { "Name": "Wert", "Email": "test@test.de", "Status": "Neu" }
 * → Notion title/rich_text Properties
 */
function buildNotionProperties(input: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  let isFirstText = true;

  for (const [key, value] of Object.entries(input)) {
    const strValue = String(value ?? "");

    if (isFirstText) {
      // Erster String-Key wird als Title-Property gesetzt
      properties[key] = {
        title: [{ text: { content: strValue } }],
      };
      isFirstText = false;
    } else if (typeof value === "number") {
      properties[key] = { number: value };
    } else if (typeof value === "boolean") {
      properties[key] = { checkbox: value };
    } else {
      properties[key] = {
        rich_text: [{ text: { content: strValue.slice(0, 2000) } }],
      };
    }
  }

  return properties;
}

/* ── Airtable Create ── */

export async function executeAirtableCreate(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const userId = getUserId(context);
  const baseId = resolveExpression(String(config.baseId || ""), context);
  const tableName = resolveExpression(String(config.tableName || ""), context);
  const rawFields = resolveExpressionDeep(config.fields || {}, context) as Record<string, unknown>;

  if (!baseId || !tableName) {
    return { contextDelta: {}, success: false, error: "Airtable Base-ID und Tabellenname erforderlich" };
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const { readConfigJson } = await import("@/lib/integrations/config-storage");
    const { createRecord } = await import("@/lib/integrations/airtable");

    // Airtable nutzt IntegrationConnection ODER AgentChannel — für Workflows verwenden wir IntegrationConnection
    const connection = await prisma.integrationConnection.findFirst({
      where: { userId, provider: "airtable", isActive: true },
    });

    let token: string;
    if (connection) {
      const airtableConfig = readConfigJson<{ personalAccessToken: string }>(connection.config).data;
      token = airtableConfig.personalAccessToken;
    } else {
      // Fallback: Token direkt in der Config (z.B. vom User eingegeben)
      const directToken = String(config.apiToken || "");
      if (!directToken) {
        return { contextDelta: {}, success: false, error: "Airtable nicht verbunden und kein API-Token angegeben" };
      }
      token = directToken;
    }

    const record = await createRecord(token, baseId, tableName, rawFields);

    return {
      contextDelta: {
        airtableRecord: {
          id: record.id,
          baseId,
          tableName,
          fields: record.fields,
          createdAt: new Date().toISOString(),
        },
      },
      success: true,
      meta: { recordId: record.id, baseId, tableName },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Airtable Eintrag fehlgeschlagen",
      meta: { baseId, tableName },
    };
  }
}

/* ── Dispatcher ── */

/** Error types for which a retry is wired in node executors. */
const NODE_RETRY_ON: WorkflowErrorType[] = ["RATE_LIMIT", "TIMEOUT", "SERVER_ERROR", "NETWORK"];

/**
 * Synthesize an Error object that classifyWorkflowError can map to one of
 * the retryable types. Uses inner.meta.status when present and pattern-
 * matches common HTTP 5xx / 429 / timeout phrases in the message.
 */
function buildClassifiableError(
  message: string | undefined,
  meta: Record<string, unknown> | undefined,
): Error & { status?: number } {
  const text = message || "node-failure";
  const error = new Error(text) as Error & { status?: number };
  const status = typeof meta?.status === "number" ? (meta.status as number) : undefined;
  if (status) {
    error.status = status;
    return error;
  }
  // Best-effort: extract status from "HTTP 503 Service Unavailable" style strings.
  const httpMatch = text.match(/HTTP\s+(\d{3})/i);
  if (httpMatch) {
    error.status = Number.parseInt(httpMatch[1], 10);
    return error;
  }
  // Pattern-only hints — let the classifier infer from the message keywords.
  if (/internal server error|service unavailable|bad gateway|gateway timeout/i.test(text)) {
    error.status = 503;
  } else if (/too many requests|rate.?limit/i.test(text)) {
    error.status = 429;
  } else if (/timeout/i.test(text)) {
    error.status = 408;
  }
  return error;
}

interface NodeWrapperOptions {
  nodeKey: string; // stable identifier for dead-letter rows
  retryCount?: number;
  retryDelayMs?: number;
}

/**
 * Pin-data short-circuit: if config carries useMockData + workflow ids, look
 * up the saved mock payload and return it instead of executing. Saves LLM /
 * API cost during debug runs.
 */
async function maybeReturnMockData(
  config: Record<string, unknown>,
  context: ExpressionContext,
): Promise<ActionNodeResult | null> {
  if (config.useMockData !== true) return null;
  const orgId = typeof context._orgId === "string" ? (context._orgId as string) : null;
  const workflowId =
    typeof config.workflowId === "string"
      ? (config.workflowId as string)
      : typeof context._workflowId === "string"
        ? (context._workflowId as string)
        : null;
  const nodeId =
    typeof config.nodeId === "string"
      ? (config.nodeId as string)
      : typeof context._currentNodeId === "string"
        ? (context._currentNodeId as string)
        : null;
  if (!orgId || !workflowId || !nodeId) return null;
  const mockName = typeof config.mockDataName === "string" ? (config.mockDataName as string) : undefined;
  const mock = await pickMockData({ orgId, workflowId, nodeId, name: mockName }).catch(() => null);
  if (!mock) return null;
  const resultKey = typeof config.resultKey === "string" ? (config.resultKey as string) : "mocked";
  return {
    contextDelta: { [resultKey]: mock },
    success: true,
    meta: { mocked: true, mockName: mockName ?? "default" },
  };
}

/**
 * Wraps a per-node executor with mock-data short-circuit, retry-with-backoff
 * for retryable provider errors, and a dead-letter record on terminal
 * failure.  Intentionally a thin wrapper — individual executors already
 * handle config-validation and return shaped ActionNodeResult on their own
 * error paths; this layer kicks in when those paths surface a retryable
 * error string we can classify.
 */
async function executeWithRetryAndDeadLetter(
  exec: (config: Record<string, unknown>, ctx: ExpressionContext) => Promise<ActionNodeResult>,
  config: Record<string, unknown>,
  context: ExpressionContext,
  options: NodeWrapperOptions,
): Promise<ActionNodeResult> {
  const mocked = await maybeReturnMockData(config, context);
  if (mocked) return mocked;

  const retryCount = typeof config.retryCount === "number" ? config.retryCount : options.retryCount ?? 2;
  const retryDelayMs = typeof config.retryDelayMs === "number" ? config.retryDelayMs : options.retryDelayMs ?? 500;

  const result = await runWithRetry(
    async () => {
      const inner = await exec(config, context);
      // Executors return success:false for both retryable and non-retryable
      // failures. Classify on a synthesized error that carries the inner
      // status hint (when available) and that recognises common upstream
      // 5xx / 429 / timeout error-message patterns.
      if (!inner.success) {
        const synthesized = buildClassifiableError(inner.error, inner.meta);
        const classified = classifyWorkflowError(synthesized);
        if (classified.retryable && NODE_RETRY_ON.includes(classified.type)) {
          throw synthesized;
        }
      }
      return inner;
    },
    { retryCount, retryDelayMs, backoff: "EXPONENTIAL", retryOn: NODE_RETRY_ON },
  );

  if (result.ok && result.value) {
    if (result.attempts.length > 0) {
      return {
        ...result.value,
        meta: { ...(result.value.meta ?? {}), retried: true, retries: result.attempts.length },
      };
    }
    return result.value;
  }

  // Terminal failure — record to dead-letter when execution context allows.
  const teamId = typeof context._teamId === "string" ? (context._teamId as string) : null;
  const executionId = typeof context._executionId === "string" ? (context._executionId as string) : null;
  if (teamId) {
    try {
      await recordDeadLetter({
        agentTeamId: teamId,
        teamExecutionId: executionId,
        nodeId: typeof context._currentNodeId === "string" ? (context._currentNodeId as string) : options.nodeKey,
        nodeType: options.nodeKey,
        payload: config,
        error: result.error?.message ?? "unknown",
        attempts: result.attempts.length,
      });
    } catch (err) {
      console.warn("[integration-nodes] dead-letter record failed", err);
    }
  }

  return {
    contextDelta: {},
    success: false,
    error: result.error?.message ?? "node-failure",
    meta: {
      attempts: result.attempts.length,
      classified: result.error?.type ?? "UNKNOWN",
    },
  };
}

export async function executeIntegrationNode(
  nodeType: string,
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  switch (nodeType) {
    case "google_sheets_read":
      return executeWithRetryAndDeadLetter(executeGoogleSheetsRead, config, context, { nodeKey: "google_sheets_read" });
    case "google_sheets_write":
      return executeWithRetryAndDeadLetter(executeGoogleSheetsWrite, config, context, { nodeKey: "google_sheets_write" });
    case "gmail_send":
      return executeWithRetryAndDeadLetter(executeGmailSend, config, context, { nodeKey: "gmail_send" });
    case "slack_send_integration":
      return executeWithRetryAndDeadLetter(executeSlackSendIntegration, config, context, { nodeKey: "slack_send_integration" });
    case "calendar_create":
      return executeWithRetryAndDeadLetter(executeCalendarCreate, config, context, { nodeKey: "calendar_create" });
    case "calendar_check":
      return executeWithRetryAndDeadLetter(executeCalendarCheck, config, context, { nodeKey: "calendar_check" });
    case "notion_create":
      return executeWithRetryAndDeadLetter(executeNotionCreate, config, context, { nodeKey: "notion_create" });
    case "airtable_create":
      return executeWithRetryAndDeadLetter(executeAirtableCreate, config, context, { nodeKey: "airtable_create" });
    case "data_query":
      return executeDataQuery(config, context);
    case "mcp_tool": {
      const serverName = String(config.serverName || "");
      const toolName = String(config.toolName || "");
      if (!serverName || !toolName) {
        return { contextDelta: {}, success: false, error: "MCP Tool benötigt serverName und toolName" };
      }
      const agentId = String(context._agentId || "");
      if (!agentId) {
        return { contextDelta: {}, success: false, error: "MCP Tool benötigt _agentId im Context" };
      }
      const mcpToolName = `mcp__${serverName}__${toolName}`;
      const args = (config.args || {}) as Record<string, unknown>;
      const { executeMCPTool } = await import("@/lib/mcp/mcp-tool-bridge");
      const resultStr = await executeMCPTool(agentId, mcpToolName, args);
      const resultData = JSON.parse(resultStr);
      return {
        contextDelta: { mcpResult: resultData },
        success: resultData.success !== false,
        error: resultData.error || undefined,
      };
    }
    default:
      throw new Error(`Unbekannter Integration-Node-Typ: ${nodeType}`);
  }
}
