import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";

const AIRTABLE_API_BASE = "https://api.airtable.com/v0";
const AIRTABLE_META_API_BASE = "https://api.airtable.com/v0/meta";
export const AIRTABLE_CHANNEL_TYPE = "AIRTABLE";

export interface AirtableBase {
  id: string;
  name: string;
  permissionLevel?: string | null;
}

export interface AirtableRecord {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
}

export interface AirtableChannelConfig {
  personalAccessToken: string;
  baseId: string;
  tableName: string;
  sampleFieldNames?: string[];
}

interface AirtableLeadPayload {
  email: string;
  name?: string | null;
  context?: string | null;
  sourceAgentName?: string | null;
  leadScore?: number | null;
  capturedAt?: string;
}

function buildAirtableHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function airtableRequest<T>(
  token: string,
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...buildAirtableHeaders(token),
      ...(init?.headers || {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errorData =
      typeof data.error === "object" && data.error !== null
        ? (data.error as Record<string, unknown>)
        : {};
    throw new Error(
      (typeof errorData.message === "string" && errorData.message) ||
        (typeof errorData.type === "string" && errorData.type) ||
        (typeof data.message === "string" && data.message) ||
        "Airtable API request failed"
    );
  }

  return data as T;
}

function buildTableUrl(baseId: string, tableName: string) {
  return `${AIRTABLE_API_BASE}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`;
}

function normalizeConfig(config: AirtableChannelConfig): AirtableChannelConfig {
  return {
    personalAccessToken: config.personalAccessToken.trim(),
    baseId: config.baseId.trim(),
    tableName: config.tableName.trim(),
    sampleFieldNames: Array.isArray(config.sampleFieldNames)
      ? config.sampleFieldNames.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [],
  };
}

export function parseAirtableConfig(config: string): AirtableChannelConfig {
  try {
    return normalizeConfig(JSON.parse(decrypt(config)) as AirtableChannelConfig);
  } catch {
    return normalizeConfig(JSON.parse(config) as AirtableChannelConfig);
  }
}

export function serializeAirtableConfig(config: AirtableChannelConfig) {
  return encrypt(JSON.stringify(normalizeConfig(config)));
}

export async function listBases(token: string): Promise<AirtableBase[]> {
  const data = await airtableRequest<{ bases?: Array<Record<string, unknown>> }>(
    token,
    `${AIRTABLE_META_API_BASE}/bases`
  );

  return (data.bases || []).map((base) => ({
    id: String(base.id || ""),
    name: String(base.name || "Untitled Base"),
    permissionLevel:
      typeof base.permissionLevel === "string" ? base.permissionLevel : null,
  }));
}

export async function listRecords(
  token: string,
  baseId: string,
  tableName: string,
  maxRecords = 10
): Promise<AirtableRecord[]> {
  const url = new URL(buildTableUrl(baseId, tableName));
  url.searchParams.set("maxRecords", String(Math.max(1, Math.min(maxRecords, 100))));

  const data = await airtableRequest<{ records?: AirtableRecord[] }>(
    token,
    url.toString()
  );

  return data.records || [];
}

export async function createRecord(
  token: string,
  baseId: string,
  tableName: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  const data = await airtableRequest<{ records?: AirtableRecord[] }>(
    token,
    buildTableUrl(baseId, tableName),
    {
      method: "POST",
      body: JSON.stringify({
        records: [{ fields }],
      }),
    }
  );

  const record = data.records?.[0];
  if (!record) {
    throw new Error("Airtable did not return the created record");
  }

  return record;
}

export async function verifyAirtableAccess(
  token: string,
  baseId: string,
  tableName: string
) {
  const records = await listRecords(token, baseId, tableName, 1);
  const sampleFieldNames = Array.from(
    new Set(
      records.flatMap((record) => Object.keys(record.fields || {}))
    )
  );

  return {
    sampleFieldNames,
    previewCount: records.length,
  };
}

export async function getAirtableIntegrationForAgent(agentId: string) {
  const channel = await prisma.agentChannel.findUnique({
    where: { agentId_type: { agentId, type: AIRTABLE_CHANNEL_TYPE as never } },
  });

  if (!channel || !channel.isActive) {
    return null;
  }

  return {
    channel,
    config: parseAirtableConfig(channel.config),
  };
}

function matchFieldName(sampleFieldNames: string[], aliases: string[], fallback: string) {
  const normalized = sampleFieldNames.map((fieldName) => ({
    value: fieldName,
    key: fieldName.trim().toLowerCase(),
  }));

  for (const alias of aliases) {
    const matched = normalized.find((field) => field.key === alias);
    if (matched) return matched.value;
  }

  return fallback;
}

function buildLeadFields(
  sampleFieldNames: string[],
  payload: AirtableLeadPayload
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  const emailField = matchFieldName(sampleFieldNames, ["email", "email address", "e-mail"], "Email");
  fields[emailField] = payload.email;

  if (payload.name) {
    fields[
      matchFieldName(sampleFieldNames, ["name", "full name", "contact name"], "Name")
    ] = payload.name;
  }

  if (payload.context) {
    fields[
      matchFieldName(sampleFieldNames, ["context", "notes", "details", "summary", "message"], "Context")
    ] = payload.context;
  }

  if (payload.sourceAgentName) {
    fields[
      matchFieldName(sampleFieldNames, ["source", "agent", "agent name"], "Source")
    ] = payload.sourceAgentName;
  }

  if (typeof payload.leadScore === "number") {
    fields[
      matchFieldName(sampleFieldNames, ["lead score", "score"], "Lead Score")
    ] = payload.leadScore;
  }

  fields[
    matchFieldName(sampleFieldNames, ["captured at", "created at", "timestamp", "date"], "Captured At")
  ] = payload.capturedAt || new Date().toISOString();

  return fields;
}

export async function syncLeadToAirtableIfConfigured(
  agentId: string,
  payload: AirtableLeadPayload
) {
  const integration = await getAirtableIntegrationForAgent(agentId);
  if (!integration) {
    return null;
  }

  const sampleFieldNames = integration.config.sampleFieldNames || [];
  const record = await createRecord(
    integration.config.personalAccessToken,
    integration.config.baseId,
    integration.config.tableName,
    buildLeadFields(sampleFieldNames, payload)
  );

  return record;
}
