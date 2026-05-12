import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";

const HUBSPOT_OAUTH_BASE = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const HUBSPOT_API_BASE = "https://api.hubapi.com";
export const HUBSPOT_PROVIDER = "hubspot";

const HUBSPOT_SCOPES = [
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.notes.write",
  "crm.schemas.deals.read",
];

export interface HubSpotTokenBundle {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope?: string | null;
  tokenType?: string | null;
  hubId?: number | null;
  hubDomain?: string | null;
  appId?: number | null;
}

export interface HubSpotConnectionConfig extends HubSpotTokenBundle {
  accountLabel?: string | null;
}

export interface HubSpotContactRecord {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface HubSpotPipelineStage {
  id: string;
  label: string;
}

export interface HubSpotPipeline {
  id: string;
  label: string;
  stages: HubSpotPipelineStage[];
}

function getOAuthCredentials() {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("HubSpot OAuth is not configured");
  }

  return { clientId, clientSecret };
}

export function getHubSpotRedirectUri() {
  return (
    process.env.HUBSPOT_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com"}/api/integrations/hubspot/callback`
  );
}

export function buildHubSpotAuthUrl(state: string) {
  const { clientId } = getOAuthCredentials();
  const url = new URL(HUBSPOT_OAUTH_BASE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getHubSpotRedirectUri());
  url.searchParams.set("scope", HUBSPOT_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeHubSpotToken(
  params: Record<string, string>
): Promise<HubSpotTokenBundle> {
  const { clientId, clientSecret } = getOAuthCredentials();
  const response = await fetch(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getHubSpotRedirectUri(),
      ...params,
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || data.status === "error" || data.error) {
    throw new Error(
      (typeof data.message === "string" && data.message) ||
        (typeof data.error_description === "string" && data.error_description) ||
        (typeof data.error === "string" && data.error) ||
        "HubSpot token exchange failed"
    );
  }

  return {
    accessToken: String(data.access_token || ""),
    refreshToken:
      typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresAt:
      Number.isFinite(Number(data.expires_in))
        ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
        : null,
    scope: typeof data.scope === "string" ? data.scope : null,
    tokenType: typeof data.token_type === "string" ? data.token_type : null,
    hubId: Number.isFinite(Number(data.hub_id)) ? Number(data.hub_id) : null,
    hubDomain: typeof data.hub_domain === "string" ? data.hub_domain : null,
    appId: Number.isFinite(Number(data.app_id)) ? Number(data.app_id) : null,
  };
}

export async function exchangeHubSpotCode(code: string) {
  return exchangeHubSpotToken({
    grant_type: "authorization_code",
    code,
  });
}

function parseHubSpotConnectionConfig(config: string): HubSpotConnectionConfig {
  return JSON.parse(decrypt(config)) as HubSpotConnectionConfig;
}

async function saveHubSpotConnectionConfig(
  connectionId: string,
  config: HubSpotConnectionConfig
) {
  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: {
      config: encrypt(JSON.stringify(config)),
      lastSyncAt: new Date(),
    },
  });
}

export class HubSpotIntegration {
  private accessToken: string;
  private refreshToken: string | null;
  private expiresAt: string | null;
  private onTokenRefresh?: (tokens: HubSpotTokenBundle) => Promise<void>;

  constructor(
    config: HubSpotTokenBundle,
    onTokenRefresh?: (tokens: HubSpotTokenBundle) => Promise<void>
  ) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.expiresAt = config.expiresAt;
    this.onTokenRefresh = onTokenRefresh;
  }

  private async ensureAccessToken() {
    const expiryMs = this.expiresAt ? new Date(this.expiresAt).getTime() : null;
    if (!expiryMs || expiryMs - Date.now() > 60_000) {
      return this.accessToken;
    }

    if (!this.refreshToken) {
      throw new Error("HubSpot access token expired and no refresh token is available");
    }

    const refreshedTokens = await exchangeHubSpotToken({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
    });

    this.accessToken = refreshedTokens.accessToken;
    this.refreshToken = refreshedTokens.refreshToken || this.refreshToken;
    this.expiresAt = refreshedTokens.expiresAt;

    if (this.onTokenRefresh) {
      await this.onTokenRefresh({
        ...refreshedTokens,
        refreshToken: this.refreshToken,
      });
    }

    return this.accessToken;
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    query?: Record<string, string | undefined>
  ): Promise<T> {
    const accessToken = await this.ensureAccessToken();
    const url = new URL(`${HUBSPOT_API_BASE}${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value) url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });

    if (response.status === 204) {
      return null as T;
    }

    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok || data.status === "error") {
      throw new Error(
        (typeof data.message === "string" && data.message) ||
          (typeof data.category === "string" && data.category) ||
          "HubSpot API request failed"
      );
    }

    return data as T;
  }

  async searchContacts(query: string): Promise<HubSpotContactRecord[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const body = trimmed.includes("@")
      ? {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "email",
                  operator: "EQ",
                  value: trimmed,
                },
              ],
            },
          ],
          limit: 10,
          properties: [
            "email",
            "firstname",
            "lastname",
            "createdate",
            "lastmodifieddate",
          ],
        }
      : {
          query: trimmed,
          limit: 10,
          properties: [
            "email",
            "firstname",
            "lastname",
            "createdate",
            "lastmodifieddate",
          ],
        };

    const data = await this.request<{
      results?: Array<{
        id: string;
        properties?: Record<string, string | null>;
        createdAt?: string;
        updatedAt?: string;
      }>;
    }>("/crm/v3/objects/contacts/search", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return (data.results || []).map((contact) => ({
      id: contact.id,
      properties: contact.properties || {},
      createdAt: contact.createdAt || null,
      updatedAt: contact.updatedAt || null,
    }));
  }

  async createContact(properties: Record<string, unknown>) {
    return this.request<{
      id: string;
      properties?: Record<string, string | null>;
    }>("/crm/v3/objects/contacts", {
      method: "POST",
      body: JSON.stringify({ properties }),
    });
  }

  async updateContact(contactId: string, properties: Record<string, unknown>) {
    return this.request<{
      id: string;
      properties?: Record<string, string | null>;
    }>(`/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  }

  async createDeal(
    properties: Record<string, unknown> & { associations?: unknown[] }
  ) {
    const { associations, ...dealProperties } = properties;

    return this.request<{
      id: string;
      properties?: Record<string, string | null>;
    }>("/crm/v3/objects/deals", {
      method: "POST",
      body: JSON.stringify({
        properties: dealProperties,
        ...(associations ? { associations } : {}),
      }),
    });
  }

  async addNote(contactId: string, note: string) {
    return this.request<{
      id: string;
      properties?: Record<string, string | null>;
    }>("/crm/v3/objects/notes", {
      method: "POST",
      body: JSON.stringify({
        properties: {
          hs_note_body: note,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 202,
              },
            ],
          },
        ],
      }),
    });
  }

  async listDealPipelines(): Promise<HubSpotPipeline[]> {
    const data = await this.request<{
      results?: Array<{
        id: string;
        label?: string;
        displayOrder?: number;
        stages?: Array<{ id: string; label?: string; displayOrder?: number }>;
      }>;
    }>("/crm/v3/pipelines/deals");

    return (data.results || [])
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .map((pipeline) => ({
        id: pipeline.id,
        label: pipeline.label || pipeline.id,
        stages: (pipeline.stages || [])
          .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
          .map((stage) => ({
            id: stage.id,
            label: stage.label || stage.id,
          })),
      }));
  }
}

export async function getHubSpotConnection(userId: string) {
  return prisma.integrationConnection.findFirst({
    where: { userId, provider: HUBSPOT_PROVIDER },
  });
}

export async function getHubSpotIntegrationForUser(userId: string) {
  const connection = await getHubSpotConnection(userId);
  if (!connection || !connection.isActive) {
    return null;
  }

  const config = parseHubSpotConnectionConfig(connection.config);
  const integration = new HubSpotIntegration(config, async (tokens) => {
    const nextConfig: HubSpotConnectionConfig = {
      ...config,
      ...tokens,
      refreshToken: tokens.refreshToken || config.refreshToken,
    };
    Object.assign(config, nextConfig);
    await saveHubSpotConnectionConfig(connection.id, nextConfig);
  });

  return {
    connection,
    config,
    integration,
    saveConfig: async (nextConfig: HubSpotConnectionConfig) => {
      Object.assign(config, nextConfig);
      await saveHubSpotConnectionConfig(connection.id, nextConfig);
    },
  };
}
