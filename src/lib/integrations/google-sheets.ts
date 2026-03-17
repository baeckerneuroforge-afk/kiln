import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_SHEETS_PROVIDER = "google-sheets";

const SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export interface GoogleSheetsTokenBundle {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope?: string | null;
  tokenType?: string | null;
}

export interface GoogleSheetsConnectionConfig extends GoogleSheetsTokenBundle {
  email?: string | null;
}

export interface SpreadsheetSummary {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

function getOAuthCredentials() {
  const clientId =
    process.env.GOOGLE_CALENDAR_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }

  return { clientId, clientSecret };
}

function getAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com").replace(/\/+$/, "");
}

export function getGoogleSheetsRedirectUri() {
  return process.env.GOOGLE_SHEETS_REDIRECT_URI || `${getAppUrl()}/api/integrations/google-sheets/callback`;
}

export function buildGoogleSheetsAuthUrl(state: string) {
  const { clientId } = getOAuthCredentials();
  const url = new URL(GOOGLE_OAUTH_BASE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGoogleSheetsRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", SHEETS_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleSheetsCode(code: string): Promise<GoogleSheetsTokenBundle> {
  const { clientId, clientSecret } = getOAuthCredentials();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getGoogleSheetsRedirectUri(),
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || "Google token exchange failed");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    scope: data.scope || null,
    tokenType: data.token_type || null,
  };
}

export class GoogleSheetsIntegration {
  private accessToken: string;
  private refreshToken: string | null;
  private expiresAt: string | null;
  private onTokenRefresh?: (tokens: GoogleSheetsTokenBundle) => Promise<void>;

  constructor(
    config: GoogleSheetsTokenBundle,
    onTokenRefresh?: (tokens: GoogleSheetsTokenBundle) => Promise<void>
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
      throw new Error("Google Sheets access token expired and no refresh token is available");
    }

    const { clientId, clientSecret } = getOAuthCredentials();
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error_description || data.error || "Google Sheets token refresh failed");
    }

    const refreshedTokens: GoogleSheetsTokenBundle = {
      accessToken: data.access_token,
      refreshToken: this.refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
      scope: data.scope || null,
      tokenType: data.token_type || null,
    };

    this.accessToken = refreshedTokens.accessToken;
    this.expiresAt = refreshedTokens.expiresAt;

    if (this.onTokenRefresh) {
      await this.onTokenRefresh(refreshedTokens);
    }

    return this.accessToken;
  }

  private async request<T>(
    baseUrl: string,
    path: string,
    init?: RequestInit,
    query?: Record<string, string | undefined>
  ): Promise<T> {
    const accessToken = await this.ensureAccessToken();
    const url = new URL(`${baseUrl}${path}`);

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

    if (response.status === 204) return null as T;

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || data.error || "Google API request failed");
    }

    return data as T;
  }

  // Spreadsheets des Nutzers via Drive API auflisten
  async listSpreadsheets(maxResults = 20): Promise<SpreadsheetSummary[]> {
    const data = await this.request<{
      files?: { id: string; name: string; modifiedTime?: string }[];
    }>(DRIVE_API, "/files", undefined, {
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      orderBy: "modifiedTime desc",
      pageSize: String(maxResults),
      fields: "files(id,name,modifiedTime)",
    });

    return (data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
    }));
  }

  // Sheet-Namen und Metadaten eines Spreadsheets
  async getSpreadsheet(spreadsheetId: string): Promise<{ title: string; sheets: SheetInfo[] }> {
    const data = await this.request<{
      properties: { title: string };
      sheets: {
        properties: {
          sheetId: number;
          title: string;
          gridProperties: { rowCount: number; columnCount: number };
        };
      }[];
    }>(SHEETS_API, `/spreadsheets/${encodeURIComponent(spreadsheetId)}`, undefined, {
      fields: "properties.title,sheets.properties",
    });

    return {
      title: data.properties.title,
      sheets: data.sheets.map((s) => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        rowCount: s.properties.gridProperties.rowCount,
        columnCount: s.properties.gridProperties.columnCount,
      })),
    };
  }

  // Zellwerte lesen
  async readRange(spreadsheetId: string, range: string): Promise<string[][]> {
    const data = await this.request<{
      values?: string[][];
    }>(SHEETS_API, `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);

    return data.values || [];
  }

  // Zeile anhängen
  async appendRow(spreadsheetId: string, range: string, values: string[]): Promise<{ updatedRange: string; updatedRows: number }> {
    const data = await this.request<{
      updates: { updatedRange: string; updatedRows: number };
    }>(
      SHEETS_API,
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`,
      {
        method: "POST",
        body: JSON.stringify({ values: [values] }),
      },
      {
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
      }
    );

    return {
      updatedRange: data.updates.updatedRange,
      updatedRows: data.updates.updatedRows,
    };
  }

  // E-Mail-Adresse des verbundenen Kontos
  async getEmail(): Promise<string> {
    const data = await this.request<{ user: { emailAddress: string } }>(
      DRIVE_API,
      "/about",
      undefined,
      { fields: "user(emailAddress)" }
    );
    return data.user.emailAddress;
  }
}

// ─── Connection helpers ───

export async function getGoogleSheetsConnection(userId: string) {
  return prisma.integrationConnection.findFirst({
    where: { userId, provider: GOOGLE_SHEETS_PROVIDER },
  });
}

function parseConnectionConfig(connection: { config: string }): GoogleSheetsConnectionConfig {
  return JSON.parse(decrypt(connection.config)) as GoogleSheetsConnectionConfig;
}

async function saveConnectionConfig(connectionId: string, config: GoogleSheetsConnectionConfig) {
  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: {
      config: encrypt(JSON.stringify(config)),
      lastSyncAt: new Date(),
    },
  });
}

export async function getGoogleSheetsIntegrationForUser(userId: string) {
  const connection = await getGoogleSheetsConnection(userId);
  if (!connection || !connection.isActive) return null;

  const config = parseConnectionConfig(connection);
  const integration = new GoogleSheetsIntegration(config, async (tokens) => {
    const nextConfig: GoogleSheetsConnectionConfig = { ...config, ...tokens };
    Object.assign(config, nextConfig);
    await saveConnectionConfig(connection.id, nextConfig);
  });

  return {
    connection,
    config,
    integration,
    saveConfig: async (nextConfig: GoogleSheetsConnectionConfig) => {
      Object.assign(config, nextConfig);
      await saveConnectionConfig(connection.id, nextConfig);
    },
  };
}

export async function getGoogleSheetsIntegrationForAgent(agentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, userId: true },
  });

  if (!agent) return null;

  const connection = await prisma.integrationConnection.findFirst({
    where: {
      userId: agent.userId,
      provider: GOOGLE_SHEETS_PROVIDER,
      isActive: true,
      agentIntegrations: {
        some: { agentId, enabled: true },
      },
    },
  });

  if (!connection) return null;

  const config = parseConnectionConfig(connection);
  const integration = new GoogleSheetsIntegration(config, async (tokens) => {
    const nextConfig: GoogleSheetsConnectionConfig = { ...config, ...tokens };
    Object.assign(config, nextConfig);
    await saveConnectionConfig(connection.id, nextConfig);
  });

  return {
    connection,
    config,
    integration,
    saveConfig: async (nextConfig: GoogleSheetsConnectionConfig) => {
      Object.assign(config, nextConfig);
      await saveConnectionConfig(connection.id, nextConfig);
    },
  };
}

export { GOOGLE_SHEETS_PROVIDER };
