/**
 * Integration Tools — expose connected integrations as agent tools.
 *
 * Pattern: each integration gets tool definitions (Anthropic.Tool[]) and
 * execution handlers that call the existing API wrapper functions.
 *
 * Write-operations return { requiresApproval: true, ... } so the chat UI
 * can show an approval card before the action is actually executed.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

// ── Types ────────────────────────────────────────────────────────────────

/** Minimal integration info passed from the chat route */
export interface AgentIntegrationInfo {
  provider: string;
  connectionId: string;
  encryptedConfig: string;
}

// ── Tool Definitions ─────────────────────────────────────────────────────

export function buildIntegrationTools(
  integrations: AgentIntegrationInfo[]
): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];
  const providers = new Set(integrations.map((i) => i.provider));

  // ─── Gmail ───────────────────────────────────────────
  if (providers.has("gmail")) {
    tools.push({
      name: "gmail_read_inbox",
      description:
        "Read the latest emails from the user's Gmail inbox. Use when the user asks about their emails, unread messages, or inbox.",
      input_schema: {
        type: "object" as const,
        properties: {
          count: {
            type: "number",
            description: "Number of emails to fetch (default 5, max 20)",
          },
          query: {
            type: "string",
            description:
              "Optional Gmail search query (e.g. 'from:boss@company.com', 'is:unread', 'subject:invoice')",
          },
        },
        required: [],
      },
    });

    tools.push({
      name: "gmail_read_email",
      description:
        "Read the full content of a specific email thread. Use when the user wants to see the details of a particular email.",
      input_schema: {
        type: "object" as const,
        properties: {
          threadId: {
            type: "string",
            description: "The Gmail thread ID to read",
          },
        },
        required: ["threadId"],
      },
    });

    tools.push({
      name: "gmail_send_email",
      description:
        "Send a new email. IMPORTANT: Always confirm the recipient, subject, and content with the user before sending.",
      input_schema: {
        type: "object" as const,
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body text" },
        },
        required: ["to", "subject", "body"],
      },
    });

    tools.push({
      name: "gmail_reply",
      description:
        "Reply to an existing email thread. IMPORTANT: Always confirm the reply content with the user before sending.",
      input_schema: {
        type: "object" as const,
        properties: {
          threadId: {
            type: "string",
            description: "The Gmail thread ID to reply to",
          },
          body: { type: "string", description: "Reply body text" },
        },
        required: ["threadId", "body"],
      },
    });
  }

  // ─── Google Sheets ───────────────────────────────────
  if (providers.has("google-sheets")) {
    tools.push({
      name: "sheets_read",
      description:
        "Read data from a Google Spreadsheet. Use when the user asks about spreadsheet data, wants to look up values, or needs to review a table.",
      input_schema: {
        type: "object" as const,
        properties: {
          spreadsheetId: {
            type: "string",
            description: "The spreadsheet ID (from the URL)",
          },
          range: {
            type: "string",
            description:
              "Cell range in A1 notation (e.g. 'Sheet1!A1:D10', 'Sheet1!A:D')",
          },
        },
        required: ["spreadsheetId", "range"],
      },
    });

    tools.push({
      name: "sheets_append",
      description:
        "Add a new row to a Google Spreadsheet. IMPORTANT: Confirm the data with the user before writing.",
      input_schema: {
        type: "object" as const,
        properties: {
          spreadsheetId: {
            type: "string",
            description: "The spreadsheet ID (from the URL)",
          },
          range: {
            type: "string",
            description:
              "Sheet and range to append to (e.g. 'Sheet1!A:E')",
          },
          values: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of cell values for the new row, in column order",
          },
        },
        required: ["spreadsheetId", "range", "values"],
      },
    });
  }

  // ─── Slack ───────────────────────────────────────────
  if (providers.has("slack")) {
    tools.push({
      name: "slack_send_message",
      description:
        "Send a message to a Slack channel. IMPORTANT: Confirm the message with the user before sending.",
      input_schema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description:
              "Slack channel name (e.g. '#general') or channel ID",
          },
          text: { type: "string", description: "Message text to send" },
        },
        required: ["channel", "text"],
      },
    });

    tools.push({
      name: "slack_list_channels",
      description:
        "List available Slack channels. Use when the user asks which channels exist or before sending a message.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    });
  }

  // ─── Notion ──────────────────────────────────────────
  if (providers.has("notion")) {
    tools.push({
      name: "notion_search",
      description:
        "Search the connected Notion workspace for pages and databases. Use when the user asks about Notion content.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query text",
          },
        },
        required: ["query"],
      },
    });

    tools.push({
      name: "notion_create_page",
      description:
        "Create a new page/entry in a Notion database. IMPORTANT: Confirm the data with the user before creating.",
      input_schema: {
        type: "object" as const,
        properties: {
          databaseId: {
            type: "string",
            description: "The Notion database ID to create the entry in",
          },
          properties: {
            type: "object",
            description:
              "Page properties as key-value pairs matching the database schema",
          },
          content: {
            type: "string",
            description: "Optional page body content (plain text)",
          },
        },
        required: ["databaseId", "properties"],
      },
    });
  }

  // ─── HubSpot ─────────────────────────────────────────
  if (providers.has("hubspot")) {
    tools.push({
      name: "hubspot_search_contacts",
      description:
        "Search HubSpot contacts by name, email, or company. Use when looking up CRM data.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search term (name, email, or company)",
          },
        },
        required: ["query"],
      },
    });

    tools.push({
      name: "hubspot_create_contact",
      description:
        "Create a new contact in HubSpot CRM. IMPORTANT: Confirm contact details with the user before creating.",
      input_schema: {
        type: "object" as const,
        properties: {
          email: { type: "string", description: "Contact email (required)" },
          firstname: { type: "string", description: "First name" },
          lastname: { type: "string", description: "Last name" },
          company: { type: "string", description: "Company name" },
          phone: { type: "string", description: "Phone number" },
        },
        required: ["email"],
      },
    });

    tools.push({
      name: "hubspot_update_contact",
      description:
        "Update an existing HubSpot contact. IMPORTANT: Confirm changes with the user before updating.",
      input_schema: {
        type: "object" as const,
        properties: {
          contactId: {
            type: "string",
            description: "HubSpot contact ID to update",
          },
          properties: {
            type: "object",
            description:
              "Properties to update (e.g. { email, firstname, lastname, company, phone })",
          },
        },
        required: ["contactId", "properties"],
      },
    });

    tools.push({
      name: "hubspot_create_deal",
      description:
        "Create a new deal in HubSpot CRM. IMPORTANT: Confirm deal details with the user before creating.",
      input_schema: {
        type: "object" as const,
        properties: {
          dealname: { type: "string", description: "Deal name" },
          amount: {
            type: "string",
            description: "Deal amount (e.g. '5000')",
          },
          pipeline: {
            type: "string",
            description: "Pipeline ID (optional, uses default if omitted)",
          },
          dealstage: {
            type: "string",
            description: "Deal stage ID (optional)",
          },
          contactId: {
            type: "string",
            description: "Associated contact ID (optional)",
          },
        },
        required: ["dealname"],
      },
    });
  }

  // ─── Airtable ────────────────────────────────────────
  if (providers.has("airtable")) {
    tools.push({
      name: "airtable_read",
      description:
        "Read records from an Airtable base. Use when the user wants to look up Airtable data.",
      input_schema: {
        type: "object" as const,
        properties: {
          baseId: {
            type: "string",
            description: "Airtable base ID",
          },
          tableName: {
            type: "string",
            description: "Table name to read from",
          },
          maxRecords: {
            type: "number",
            description: "Max records to return (default 10, max 100)",
          },
        },
        required: ["baseId", "tableName"],
      },
    });

    tools.push({
      name: "airtable_create",
      description:
        "Create a new record in an Airtable table. IMPORTANT: Confirm the data with the user before creating.",
      input_schema: {
        type: "object" as const,
        properties: {
          baseId: {
            type: "string",
            description: "Airtable base ID",
          },
          tableName: {
            type: "string",
            description: "Table name to add the record to",
          },
          fields: {
            type: "object",
            description:
              "Record fields as key-value pairs matching the table columns",
          },
        },
        required: ["baseId", "tableName", "fields"],
      },
    });
  }

  return tools;
}

// ── Helper: check if a tool name belongs to integration tools ─────────

const INTEGRATION_TOOL_NAMES = new Set([
  "gmail_read_inbox",
  "gmail_read_email",
  "gmail_send_email",
  "gmail_reply",
  "sheets_read",
  "sheets_append",
  "slack_send_message",
  "slack_list_channels",
  "notion_search",
  "notion_create_page",
  "hubspot_search_contacts",
  "hubspot_create_contact",
  "hubspot_update_contact",
  "hubspot_create_deal",
  "airtable_read",
  "airtable_create",
]);

export function isIntegrationToolName(name: string): boolean {
  return INTEGRATION_TOOL_NAMES.has(name);
}

// ── Write tools that require user approval ───────────────────────────

const WRITE_TOOLS = new Set([
  "gmail_send_email",
  "gmail_reply",
  "sheets_append",
  "slack_send_message",
  "notion_create_page",
  "hubspot_create_contact",
  "hubspot_update_contact",
  "hubspot_create_deal",
  "airtable_create",
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

// ── Tool Execution ───────────────────────────────────────────────────

export async function executeIntegrationTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  agentId: string,
  integrations: AgentIntegrationInfo[]
): Promise<string> {
  try {
    // Write tools: return approval request instead of executing
    if (isWriteTool(toolName)) {
      return JSON.stringify({
        requiresApproval: true,
        toolName,
        action: describeAction(toolName, toolInput),
        params: toolInput,
      });
    }

    return await executeReadTool(toolName, toolInput, agentId, integrations);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Integration tool failed";
    console.warn(`[INTEGRATION] ${toolName} failed:`, msg);
    return JSON.stringify({ success: false, error: msg });
  }
}

/**
 * Execute a write tool after user approval.
 * Called from the approval endpoint, NOT during normal tool execution.
 */
export async function executeApprovedWriteTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  agentId: string,
  integrations: AgentIntegrationInfo[]
): Promise<string> {
  try {
    return await executeWriteTool(toolName, toolInput, agentId, integrations);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Integration tool failed";
    console.warn(`[INTEGRATION] Approved ${toolName} failed:`, msg);
    return JSON.stringify({ success: false, error: msg });
  }
}

// ── Internal: Read tool execution ────────────────────────────────────

async function executeReadTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  agentId: string,
  integrations: AgentIntegrationInfo[]
): Promise<string> {
  switch (toolName) {
    // ── Gmail Read ──
    case "gmail_read_inbox": {
      const gmail = await getGmailForAgent(agentId, integrations);
      if (!gmail) return noConnection("Gmail");

      const count = Math.min(Math.max(1, Number(toolInput.count) || 5), 20);
      const query = typeof toolInput.query === "string" ? toolInput.query : undefined;
      const messages = await gmail.getInboxMessages(query, count);

      return JSON.stringify({
        success: true,
        messages: messages.map((m) => ({
          id: m.id,
          threadId: m.threadId,
          from: m.from,
          subject: m.subject,
          snippet: m.snippet,
          date: m.date,
        })),
      });
    }

    case "gmail_read_email": {
      const gmail = await getGmailForAgent(agentId, integrations);
      if (!gmail) return noConnection("Gmail");

      const threadId = toolInput.threadId as string;
      const thread = await gmail.getThread(threadId);

      return JSON.stringify({
        success: true,
        thread: {
          id: thread.id,
          messages: thread.messages.map((m) => ({
            id: m.id,
            from: m.from,
            to: m.to,
            subject: m.subject,
            body: m.body,
            date: m.date,
          })),
        },
      });
    }

    // ── Google Sheets Read ──
    case "sheets_read": {
      const sheets = await getSheetsForAgent(agentId, integrations);
      if (!sheets) return noConnection("Google Sheets");

      const spreadsheetId = toolInput.spreadsheetId as string;
      const range = toolInput.range as string;
      const data = await sheets.readRange(spreadsheetId, range);

      return JSON.stringify({
        success: true,
        range,
        rows: data.length,
        data,
      });
    }

    // ── Slack Read ──
    case "slack_list_channels": {
      const slack = getSlackToken(integrations);
      if (!slack) return noConnection("Slack");

      const { listSlackChannels } = await import("@/lib/integrations/slack");
      const channels = await listSlackChannels(slack);

      return JSON.stringify({
        success: true,
        channels: channels.map((c) => ({
          id: c.id,
          name: c.name,
          isMember: c.isMember,
        })),
      });
    }

    // ── Notion Read ──
    case "notion_search": {
      const notionToken = getNotionToken(integrations);
      if (!notionToken) return noConnection("Notion");

      const { searchNotion } = await import("@/lib/integrations/notion");
      const query = (toolInput.query as string) || "";
      const results = await searchNotion(notionToken, query);

      return JSON.stringify({
        success: true,
        results: results.slice(0, 10).map((r) => ({
          id: r.id,
          title: r.title || "Untitled",
          type: "properties" in r ? "database" : "page",
          url: r.url,
        })),
      });
    }

    // ── HubSpot Read ──
    case "hubspot_search_contacts": {
      const hubspot = await getHubSpotForAgent(agentId, integrations);
      if (!hubspot) return noConnection("HubSpot");

      const query = (toolInput.query as string) || "";
      const contacts = await hubspot.searchContacts(query);

      return JSON.stringify({
        success: true,
        contacts: contacts.slice(0, 10).map((c) => ({
          id: c.id,
          email: c.properties?.email,
          firstname: c.properties?.firstname,
          lastname: c.properties?.lastname,
          company: c.properties?.company,
        })),
      });
    }

    // ── Airtable Read ──
    case "airtable_read": {
      const airtableToken = getAirtableToken(integrations);
      if (!airtableToken) return noConnection("Airtable");

      const { listRecords } = await import("@/lib/integrations/airtable");
      const baseId = toolInput.baseId as string;
      const tableName = toolInput.tableName as string;
      const maxRecords = Math.min(Math.max(1, Number(toolInput.maxRecords) || 10), 100);
      const records = await listRecords(airtableToken, baseId, tableName, maxRecords);

      return JSON.stringify({
        success: true,
        records: records.map((r) => ({
          id: r.id,
          fields: r.fields,
        })),
      });
    }

    default:
      return JSON.stringify({ success: false, error: `Unknown read tool: ${toolName}` });
  }
}

// ── Internal: Write tool execution (only after approval) ─────────────

async function executeWriteTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  agentId: string,
  integrations: AgentIntegrationInfo[]
): Promise<string> {
  switch (toolName) {
    // ── Gmail Write ──
    case "gmail_send_email": {
      const gmail = await getGmailForAgent(agentId, integrations);
      if (!gmail) return noConnection("Gmail");

      const result = await gmail.sendEmail(
        toolInput.to as string,
        toolInput.subject as string,
        toolInput.body as string
      );
      return JSON.stringify({ success: true, messageId: result.id, threadId: result.threadId });
    }

    case "gmail_reply": {
      const gmail = await getGmailForAgent(agentId, integrations);
      if (!gmail) return noConnection("Gmail");

      // Get last message in thread to reply to
      const thread = await gmail.getThread(toolInput.threadId as string);
      const lastMessage = thread.messages[thread.messages.length - 1];
      const result = await gmail.sendEmail(
        lastMessage.from || "",
        `Re: ${lastMessage.subject || ""}`,
        toolInput.body as string,
        lastMessage.id
      );
      return JSON.stringify({ success: true, messageId: result.id, threadId: result.threadId });
    }

    // ── Google Sheets Write ──
    case "sheets_append": {
      const sheets = await getSheetsForAgent(agentId, integrations);
      if (!sheets) return noConnection("Google Sheets");

      const values = Array.isArray(toolInput.values)
        ? toolInput.values.map(String)
        : [];
      const result = await sheets.appendRow(
        toolInput.spreadsheetId as string,
        toolInput.range as string,
        values
      );
      return JSON.stringify({
        success: true,
        updatedRange: result.updatedRange,
        updatedRows: result.updatedRows,
      });
    }

    // ── Slack Write ──
    case "slack_send_message": {
      const token = getSlackToken(integrations);
      if (!token) return noConnection("Slack");

      const { sendSlackMessage } = await import("@/lib/integrations/slack");
      const result = await sendSlackMessage(
        token,
        toolInput.channel as string,
        toolInput.text as string
      );
      if (!result.ok) {
        return JSON.stringify({ success: false, error: result.error || "Slack API error" });
      }
      return JSON.stringify({ success: true, ts: result.ts });
    }

    // ── Notion Write ──
    case "notion_create_page": {
      const notionToken = getNotionToken(integrations);
      if (!notionToken) return noConnection("Notion");

      const { createDatabaseEntry } = await import("@/lib/integrations/notion");
      const properties = (toolInput.properties || {}) as Record<string, unknown>;
      const content = typeof toolInput.content === "string" ? toolInput.content : undefined;
      const result = await createDatabaseEntry(
        notionToken,
        toolInput.databaseId as string,
        properties,
        content
      );
      return JSON.stringify({ success: true, pageId: result.id, url: result.url });
    }

    // ── HubSpot Write ──
    case "hubspot_create_contact": {
      const hubspot = await getHubSpotForAgent(agentId, integrations);
      if (!hubspot) return noConnection("HubSpot");

      const props: Record<string, unknown> = {};
      if (toolInput.email) props.email = toolInput.email;
      if (toolInput.firstname) props.firstname = toolInput.firstname;
      if (toolInput.lastname) props.lastname = toolInput.lastname;
      if (toolInput.company) props.company = toolInput.company;
      if (toolInput.phone) props.phone = toolInput.phone;

      const result = await hubspot.createContact(props);
      return JSON.stringify({ success: true, contactId: result.id });
    }

    case "hubspot_update_contact": {
      const hubspot = await getHubSpotForAgent(agentId, integrations);
      if (!hubspot) return noConnection("HubSpot");

      const result = await hubspot.updateContact(
        toolInput.contactId as string,
        (toolInput.properties || {}) as Record<string, unknown>
      );
      return JSON.stringify({ success: true, contactId: result.id });
    }

    case "hubspot_create_deal": {
      const hubspot = await getHubSpotForAgent(agentId, integrations);
      if (!hubspot) return noConnection("HubSpot");

      const dealProps: Record<string, unknown> = {
        dealname: toolInput.dealname,
      };
      if (toolInput.amount) dealProps.amount = toolInput.amount;
      if (toolInput.pipeline) dealProps.pipeline = toolInput.pipeline;
      if (toolInput.dealstage) dealProps.dealstage = toolInput.dealstage;

      // Associate with contact if provided
      if (toolInput.contactId) {
        dealProps.associations = [
          {
            to: { id: toolInput.contactId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
          },
        ];
      }

      const result = await hubspot.createDeal(dealProps);
      return JSON.stringify({ success: true, dealId: result.id });
    }

    // ── Airtable Write ──
    case "airtable_create": {
      const airtableToken = getAirtableToken(integrations);
      if (!airtableToken) return noConnection("Airtable");

      const { createRecord } = await import("@/lib/integrations/airtable");
      const fields = (toolInput.fields || {}) as Record<string, unknown>;
      const record = await createRecord(
        airtableToken,
        toolInput.baseId as string,
        toolInput.tableName as string,
        fields
      );
      return JSON.stringify({ success: true, recordId: record.id, fields: record.fields });
    }

    default:
      return JSON.stringify({ success: false, error: `Unknown write tool: ${toolName}` });
  }
}

// ── Helpers: get integration instances ────────────────────────────────

function noConnection(name: string): string {
  return JSON.stringify({
    success: false,
    error: `${name} is not connected for this agent. Ask the owner to connect it in Settings > Integrations.`,
  });
}

function decryptConfig(encrypted: string): Record<string, string> {
  try {
    return JSON.parse(decrypt(encrypted)) as Record<string, string>;
  } catch {
    return {};
  }
}

function findIntegration(
  integrations: AgentIntegrationInfo[],
  provider: string
): AgentIntegrationInfo | undefined {
  return integrations.find((i) => i.provider === provider);
}

async function getGmailForAgent(
  agentId: string,
  integrations: AgentIntegrationInfo[]
) {
  const info = findIntegration(integrations, "gmail");
  if (!info) return null;

  const { getGmailIntegrationForAgent } = await import(
    "@/lib/integrations/gmail"
  );
  const result = await getGmailIntegrationForAgent(agentId);
  return result?.integration ?? null;
}

async function getSheetsForAgent(
  agentId: string,
  integrations: AgentIntegrationInfo[]
) {
  const info = findIntegration(integrations, "google-sheets");
  if (!info) return null;

  const { getGoogleSheetsIntegrationForAgent } = await import(
    "@/lib/integrations/google-sheets"
  );
  const result = await getGoogleSheetsIntegrationForAgent(agentId);
  return result?.integration ?? null;
}

function getSlackToken(integrations: AgentIntegrationInfo[]): string | null {
  const info = findIntegration(integrations, "slack");
  if (!info) return null;
  const config = decryptConfig(info.encryptedConfig);
  return config.accessToken || config.access_token || null;
}

function getNotionToken(integrations: AgentIntegrationInfo[]): string | null {
  const info = findIntegration(integrations, "notion");
  if (!info) return null;
  const config = decryptConfig(info.encryptedConfig);
  return config.accessToken || config.access_token || null;
}

async function getHubSpotForAgent(
  agentId: string,
  integrations: AgentIntegrationInfo[]
) {
  const info = findIntegration(integrations, "hubspot");
  if (!info) return null;

  // Get agent's userId to load HubSpot integration
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  });
  if (!agent) return null;

  const { getHubSpotIntegrationForUser } = await import(
    "@/lib/integrations/hubspot"
  );
  const result = await getHubSpotIntegrationForUser(agent.userId);
  return result?.integration ?? null;
}

function getAirtableToken(integrations: AgentIntegrationInfo[]): string | null {
  const info = findIntegration(integrations, "airtable");
  if (!info) return null;
  const config = decryptConfig(info.encryptedConfig);
  return config.token || config.apiKey || config.accessToken || null;
}

// ── Helpers: describe write actions for approval UI ──────────────────

function describeAction(
  toolName: string,
  params: Record<string, unknown>
): string {
  switch (toolName) {
    case "gmail_send_email":
      return `E-Mail senden an ${params.to}: "${params.subject}"`;
    case "gmail_reply":
      return `Auf E-Mail-Thread antworten`;
    case "sheets_append":
      return `Zeile in Spreadsheet hinzufügen`;
    case "slack_send_message":
      return `Slack-Nachricht an ${params.channel} senden`;
    case "notion_create_page":
      return `Notion-Eintrag erstellen`;
    case "hubspot_create_contact":
      return `HubSpot-Kontakt erstellen: ${params.email}`;
    case "hubspot_update_contact":
      return `HubSpot-Kontakt aktualisieren (ID: ${params.contactId})`;
    case "hubspot_create_deal":
      return `HubSpot-Deal erstellen: "${params.dealname}"`;
    case "airtable_create":
      return `Airtable-Eintrag erstellen`;
    default:
      return toolName;
  }
}
