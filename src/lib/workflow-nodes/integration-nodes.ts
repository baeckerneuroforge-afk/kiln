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
    const { decrypt } = await import("@/lib/encryption");
    const { sendSlackMessage } = await import("@/lib/integrations/slack");

    const connection = await prisma.integrationConnection.findFirst({
      where: { userId, provider: "slack", isActive: true },
    });
    if (!connection) {
      return { contextDelta: {}, success: false, error: "Slack nicht verbunden. Bitte zuerst im Integration Hub verbinden." };
    }

    const slackConfig = JSON.parse(decrypt(connection.config)) as { accessToken: string };
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
    const { decrypt } = await import("@/lib/encryption");
    const { createRecord } = await import("@/lib/integrations/airtable");

    // Airtable nutzt IntegrationConnection ODER AgentChannel — für Workflows verwenden wir IntegrationConnection
    const connection = await prisma.integrationConnection.findFirst({
      where: { userId, provider: "airtable", isActive: true },
    });

    let token: string;
    if (connection) {
      const airtableConfig = JSON.parse(decrypt(connection.config)) as { personalAccessToken: string };
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

export async function executeIntegrationNode(
  nodeType: string,
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  switch (nodeType) {
    case "google_sheets_read":
      return executeGoogleSheetsRead(config, context);
    case "google_sheets_write":
      return executeGoogleSheetsWrite(config, context);
    case "gmail_send":
      return executeGmailSend(config, context);
    case "slack_send_integration":
      return executeSlackSendIntegration(config, context);
    case "calendar_create":
      return executeCalendarCreate(config, context);
    case "calendar_check":
      return executeCalendarCheck(config, context);
    case "notion_create":
      return executeNotionCreate(config, context);
    case "airtable_create":
      return executeAirtableCreate(config, context);
    default:
      throw new Error(`Unbekannter Integration-Node-Typ: ${nodeType}`);
  }
}
