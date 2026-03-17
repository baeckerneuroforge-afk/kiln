import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const GMAIL_PROVIDER = "gmail";

// Scopes: send emails and read inbox
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export interface GmailTokenBundle {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope?: string | null;
  tokenType?: string | null;
}

export interface GmailConnectionConfig extends GmailTokenBundle {
  email?: string | null;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

export interface GmailThread {
  id: string;
  messages: GmailMessage[];
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

export function getGmailRedirectUri() {
  return process.env.GMAIL_REDIRECT_URI || `${getAppUrl()}/api/integrations/gmail/callback`;
}

export function buildGmailAuthUrl(state: string) {
  const { clientId } = getOAuthCredentials();
  const url = new URL(GOOGLE_OAUTH_BASE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGmailRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GMAIL_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGmailCode(code: string): Promise<GmailTokenBundle> {
  const { clientId, clientSecret } = getOAuthCredentials();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getGmailRedirectUri(),
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

export class GmailIntegration {
  private accessToken: string;
  private refreshToken: string | null;
  private expiresAt: string | null;
  private onTokenRefresh?: (tokens: GmailTokenBundle) => Promise<void>;

  constructor(
    config: GmailTokenBundle,
    onTokenRefresh?: (tokens: GmailTokenBundle) => Promise<void>
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
      throw new Error("Gmail access token expired and no refresh token is available");
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
      throw new Error(data.error_description || data.error || "Gmail token refresh failed");
    }

    const refreshedTokens: GmailTokenBundle = {
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
    path: string,
    init?: RequestInit,
    query?: Record<string, string | undefined>
  ): Promise<T> {
    const accessToken = await this.ensureAccessToken();
    const url = new URL(`${GMAIL_API}${path}`);

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

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || data.error || "Gmail API request failed");
    }

    return data as T;
  }

  // Holt die E-Mail-Adresse des verbundenen Kontos
  async getProfile(): Promise<{ emailAddress: string; messagesTotal: number }> {
    return this.request<{ emailAddress: string; messagesTotal: number }>("/users/me/profile");
  }

  // Letzte Nachrichten aus dem Posteingang
  async getInboxMessages(query = "", maxResults = 10): Promise<GmailMessage[]> {
    const listData = await this.request<{
      messages?: { id: string; threadId: string }[];
    }>("/users/me/messages", undefined, {
      q: query || "in:inbox",
      maxResults: String(maxResults),
    });

    if (!listData.messages || listData.messages.length === 0) {
      return [];
    }

    const messages: GmailMessage[] = [];
    for (const msg of listData.messages) {
      try {
        const detail = await this.request<{
          id: string;
          threadId: string;
          snippet: string;
          payload: {
            headers: { name: string; value: string }[];
            body?: { data?: string };
            parts?: { mimeType: string; body?: { data?: string } }[];
          };
        }>(`/users/me/messages/${msg.id}`, undefined, { format: "full" });

        const headers = detail.payload.headers;
        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        // Body aus plain text oder html part extrahieren
        let body = "";
        if (detail.payload.body?.data) {
          body = Buffer.from(detail.payload.body.data, "base64url").toString("utf-8");
        } else if (detail.payload.parts) {
          const textPart = detail.payload.parts.find((p) => p.mimeType === "text/plain");
          const htmlPart = detail.payload.parts.find((p) => p.mimeType === "text/html");
          const part = textPart || htmlPart;
          if (part?.body?.data) {
            body = Buffer.from(part.body.data, "base64url").toString("utf-8");
          }
        }

        messages.push({
          id: detail.id,
          threadId: detail.threadId,
          snippet: detail.snippet,
          subject: getHeader("Subject"),
          from: getHeader("From"),
          to: getHeader("To"),
          date: getHeader("Date"),
          body,
        });
      } catch {
        // Einzelne Message fehlgeschlagen → überspringen
      }
    }

    return messages;
  }

  // Ganzen Thread laden
  async getThread(threadId: string): Promise<GmailThread> {
    const data = await this.request<{
      id: string;
      messages: {
        id: string;
        threadId: string;
        snippet: string;
        payload: {
          headers: { name: string; value: string }[];
          body?: { data?: string };
          parts?: { mimeType: string; body?: { data?: string } }[];
        };
      }[];
    }>(`/users/me/threads/${threadId}`, undefined, { format: "full" });

    const messages: GmailMessage[] = data.messages.map((msg) => {
      const headers = msg.payload.headers;
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      let body = "";
      if (msg.payload.body?.data) {
        body = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
      } else if (msg.payload.parts) {
        const textPart = msg.payload.parts.find((p) => p.mimeType === "text/plain");
        const htmlPart = msg.payload.parts.find((p) => p.mimeType === "text/html");
        const part = textPart || htmlPart;
        if (part?.body?.data) {
          body = Buffer.from(part.body.data, "base64url").toString("utf-8");
        }
      }

      return {
        id: msg.id,
        threadId: msg.threadId,
        snippet: msg.snippet,
        subject: getHeader("Subject"),
        from: getHeader("From"),
        to: getHeader("To"),
        date: getHeader("Date"),
        body,
      };
    });

    return { id: data.id, messages };
  }

  // E-Mail senden (RFC 2822 Format)
  async sendEmail(to: string, subject: string, body: string, replyToMessageId?: string): Promise<{ id: string; threadId: string }> {
    const lines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset="UTF-8"`,
    ];

    if (replyToMessageId) {
      lines.push(`In-Reply-To: ${replyToMessageId}`);
      lines.push(`References: ${replyToMessageId}`);
    }

    lines.push("", body);
    const raw = Buffer.from(lines.join("\r\n")).toString("base64url");

    return this.request<{ id: string; threadId: string }>(
      "/users/me/messages/send",
      {
        method: "POST",
        body: JSON.stringify({ raw }),
      }
    );
  }
}

// ─── Connection helpers ───

export async function getGmailConnection(userId: string) {
  return prisma.integrationConnection.findFirst({
    where: { userId, provider: GMAIL_PROVIDER },
  });
}

function parseConnectionConfig(connection: { config: string }): GmailConnectionConfig {
  return JSON.parse(decrypt(connection.config)) as GmailConnectionConfig;
}

async function saveConnectionConfig(connectionId: string, config: GmailConnectionConfig) {
  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: {
      config: encrypt(JSON.stringify(config)),
      lastSyncAt: new Date(),
    },
  });
}

export async function getGmailIntegrationForUser(userId: string) {
  const connection = await getGmailConnection(userId);
  if (!connection || !connection.isActive) {
    return null;
  }

  const config = parseConnectionConfig(connection);
  const integration = new GmailIntegration(config, async (tokens) => {
    const nextConfig: GmailConnectionConfig = { ...config, ...tokens };
    Object.assign(config, nextConfig);
    await saveConnectionConfig(connection.id, nextConfig);
  });

  return {
    connection,
    config,
    integration,
    saveConfig: async (nextConfig: GmailConnectionConfig) => {
      Object.assign(config, nextConfig);
      await saveConnectionConfig(connection.id, nextConfig);
    },
  };
}

export async function getGmailIntegrationForAgent(agentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, userId: true },
  });

  if (!agent) return null;

  const connection = await prisma.integrationConnection.findFirst({
    where: {
      userId: agent.userId,
      provider: GMAIL_PROVIDER,
      isActive: true,
      agentIntegrations: {
        some: { agentId, enabled: true },
      },
    },
  });

  if (!connection) return null;

  const config = parseConnectionConfig(connection);
  const integration = new GmailIntegration(config, async (tokens) => {
    const nextConfig: GmailConnectionConfig = { ...config, ...tokens };
    Object.assign(config, nextConfig);
    await saveConnectionConfig(connection.id, nextConfig);
  });

  return {
    connection,
    config,
    integration,
    saveConfig: async (nextConfig: GmailConnectionConfig) => {
      Object.assign(config, nextConfig);
      await saveConnectionConfig(connection.id, nextConfig);
    },
  };
}

export { GMAIL_PROVIDER };
