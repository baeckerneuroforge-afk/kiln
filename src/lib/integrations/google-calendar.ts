import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { readConfigJson } from "./config-storage";
import { logAudit } from "@/lib/audit/logger";

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_CALENDAR_PROVIDER = "google_calendar";
const LEGACY_GOOGLE_CALENDAR_PROVIDER = "google-calendar";

export interface GoogleCalendarTokenBundle {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope?: string | null;
  tokenType?: string | null;
}

export interface GoogleCalendarConnectionConfig extends GoogleCalendarTokenBundle {
  selectedCalendarId?: string | null;
  selectedCalendarName?: string | null;
}

export interface GoogleCalendarCalendar {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  timeZone?: string;
  accessRole?: string;
}

export interface GoogleCalendarSlot {
  start: string;
  end: string;
  label: string;
}

export interface GoogleCalendarDateRange {
  start: string;
  end: string;
  timezone?: string;
  slotMinutes?: number;
  dayStartHour?: number;
  dayEndHour?: number;
  maxSlots?: number;
}

export interface GoogleCalendarEventInput {
  title: string;
  description?: string;
  start: string;
  end: string;
  timezone?: string;
  attendeeName?: string | null;
  attendeeEmail?: string | null;
  location?: string | null;
}

export interface GoogleCalendarEventResult {
  id: string;
  htmlLink?: string;
  summary: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email?: string; displayName?: string }[];
  status?: string;
}

function getOAuthCredentials() {
  const clientId =
    process.env.GOOGLE_CALENDAR_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar OAuth is not configured");
  }

  return { clientId, clientSecret };
}

function getAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com").replace(/\/+$/, "");
}

export function getGoogleCalendarRedirectUri() {
  return (
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    `${getAppUrl()}/api/integrations/google-calendar/callback`
  );
}

export function buildGoogleCalendarAuthUrl(state: string) {
  const { clientId } = getOAuthCredentials();
  const url = new URL(GOOGLE_OAUTH_BASE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGoogleCalendarRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCalendarCode(code: string): Promise<GoogleCalendarTokenBundle> {
  const { clientId, clientSecret } = getOAuthCredentials();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getGoogleCalendarRedirectUri(),
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

export class GoogleCalendarIntegration {
  private accessToken: string;
  private refreshToken: string | null;
  private expiresAt: string | null;
  private onTokenRefresh?: (tokens: GoogleCalendarTokenBundle) => Promise<void>;

  constructor(
    config: GoogleCalendarTokenBundle,
    onTokenRefresh?: (tokens: GoogleCalendarTokenBundle) => Promise<void>
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
      throw new Error("Google Calendar access token expired and no refresh token is available");
    }

    const { clientId, clientSecret } = getOAuthCredentials();
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error_description || data.error || "Google Calendar token refresh failed");
    }

    const refreshedTokens: GoogleCalendarTokenBundle = {
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
    const url = new URL(`${GOOGLE_CALENDAR_API}${path}`);

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
      throw new Error(data.error?.message || data.error || "Google Calendar API request failed");
    }

    return data as T;
  }

  async listCalendars(): Promise<GoogleCalendarCalendar[]> {
    const data = await this.request<{ items?: Array<Record<string, unknown>> }>(
      "/users/me/calendarList",
      undefined,
      {
        minAccessRole: "writer",
        showHidden: "false",
        showDeleted: "false",
      }
    );

    return (data.items || []).map((calendar) => ({
      id: String(calendar.id || ""),
      summary: String(calendar.summary || "Unnamed calendar"),
      description: typeof calendar.description === "string" ? calendar.description : undefined,
      primary: Boolean(calendar.primary),
      timeZone: typeof calendar.timeZone === "string" ? calendar.timeZone : undefined,
      accessRole: typeof calendar.accessRole === "string" ? calendar.accessRole : undefined,
    }));
  }

  async listUpcomingEvents(calendarId: string, maxResults = 5): Promise<GoogleCalendarEventResult[]> {
    const data = await this.request<{ items?: GoogleCalendarEventResult[] }>(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      undefined,
      {
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: new Date().toISOString(),
        maxResults: String(maxResults),
      }
    );

    return data.items || [];
  }

  async getAvailableSlots(
    calendarId: string,
    dateRange: GoogleCalendarDateRange
  ): Promise<GoogleCalendarSlot[]> {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw new Error("Invalid date range");
    }

    const timezone = dateRange.timezone || "UTC";
    const slotMinutes = dateRange.slotMinutes || 30;
    const dayStartHour = dateRange.dayStartHour ?? 9;
    const dayEndHour = dateRange.dayEndHour ?? 17;
    const maxSlots = dateRange.maxSlots || 8;

    const busyData = await this.request<{
      calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
    }>("/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        timeZone: timezone,
        items: [{ id: calendarId }],
      }),
    });

    const busyRanges = busyData.calendars?.[calendarId]?.busy || [];
    const busyIntervals = busyRanges.map((range) => ({
      start: new Date(range.start).getTime(),
      end: new Date(range.end).getTime(),
    }));

    const slots: GoogleCalendarSlot[] = [];
    const cursor = new Date(start);

    while (cursor < end && slots.length < maxSlots) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60_000);
      const startMinutes = slotStart.getHours() * 60 + slotStart.getMinutes();
      const endMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();

      const withinWorkingHours =
        startMinutes >= dayStartHour * 60 && endMinutes <= dayEndHour * 60;
      const overlapsBusy = busyIntervals.some(
        (interval) => slotStart.getTime() < interval.end && slotEnd.getTime() > interval.start
      );

      if (withinWorkingHours && !overlapsBusy && slotEnd <= end) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: timezone,
          }).format(slotStart),
        });
      }

      cursor.setMinutes(cursor.getMinutes() + slotMinutes);
    }

    return slots;
  }

  async createEvent(calendarId: string, event: GoogleCalendarEventInput): Promise<GoogleCalendarEventResult> {
    return this.request<GoogleCalendarEventResult>(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        body: JSON.stringify({
          summary: event.title,
          description: event.description,
          location: event.location || undefined,
          start: {
            dateTime: event.start,
            timeZone: event.timezone || "UTC",
          },
          end: {
            dateTime: event.end,
            timeZone: event.timezone || "UTC",
          },
          attendees: event.attendeeEmail
            ? [
                {
                  email: event.attendeeEmail,
                  displayName: event.attendeeName || undefined,
                },
              ]
            : undefined,
        }),
      },
      { sendUpdates: "all" }
    );
  }

  async cancelEvent(eventId: string, calendarId = "primary") {
    await this.request(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
      { sendUpdates: "all" }
    );
  }
}

export function isGoogleCalendarProvider(provider: string) {
  return provider === GOOGLE_CALENDAR_PROVIDER || provider === LEGACY_GOOGLE_CALENDAR_PROVIDER;
}

export async function getGoogleCalendarConnection(userId: string) {
  return prisma.integrationConnection.findFirst({
    where: {
      userId,
      provider: { in: [GOOGLE_CALENDAR_PROVIDER, LEGACY_GOOGLE_CALENDAR_PROVIDER] },
    },
  });
}

function parseConnectionConfig(connection: { config: string }): GoogleCalendarConnectionConfig {
  return readConfigJson<GoogleCalendarConnectionConfig>(connection.config).data;
}

async function saveConnectionConfig(args: {
  connectionId: string;
  orgId?: string | null;
  userId?: string | null;
  config: GoogleCalendarConnectionConfig;
  reason: "oauth_callback" | "token_refresh" | "manual_update";
}) {
  await prisma.integrationConnection.update({
    where: { id: args.connectionId },
    data: {
      config: encrypt(JSON.stringify(args.config)),
      lastSyncAt: new Date(),
    },
  });
  if (args.reason === "token_refresh" && args.orgId) {
    await logAudit({
      orgId: args.orgId,
      actorUserId: args.userId ?? null,
      actorType: "SYSTEM",
      action: "INTEGRATION_TOKEN_REFRESHED",
      resourceType: "INTEGRATION_CONNECTION",
      resourceId: args.connectionId,
      description: "Google Calendar access token refreshed",
      severity: "INFO",
      metadata: { provider: GOOGLE_CALENDAR_PROVIDER },
    });
  }
}

export async function getGoogleCalendarIntegrationForUser(userId: string) {
  const connection = await getGoogleCalendarConnection(userId);
  if (!connection || !connection.isActive) {
    return null;
  }

  const config = parseConnectionConfig(connection);
  const integration = new GoogleCalendarIntegration(config, async (tokens) => {
    const nextConfig: GoogleCalendarConnectionConfig = {
      ...config,
      ...tokens,
    };
    Object.assign(config, nextConfig);
    await saveConnectionConfig({
      connectionId: connection.id,
      orgId: connection.orgId,
      userId: connection.userId,
      config: nextConfig,
      reason: "token_refresh",
    });
  });

  return {
    connection,
    config,
    integration,
    saveConfig: async (nextConfig: GoogleCalendarConnectionConfig) => {
      Object.assign(config, nextConfig);
      await saveConnectionConfig({
        connectionId: connection.id,
        orgId: connection.orgId,
        userId: connection.userId,
        config: nextConfig,
        reason: "manual_update",
      });
    },
  };
}

export async function getGoogleCalendarIntegrationForAgent(agentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, userId: true },
  });

  if (!agent) {
    return null;
  }

  const connection = await prisma.integrationConnection.findFirst({
    where: {
      userId: agent.userId,
      provider: { in: [GOOGLE_CALENDAR_PROVIDER, LEGACY_GOOGLE_CALENDAR_PROVIDER] },
      isActive: true,
      agentIntegrations: {
        some: {
          agentId,
          enabled: true,
        },
      },
    },
  });

  if (!connection) {
    return null;
  }

  const config = parseConnectionConfig(connection);
  const integration = new GoogleCalendarIntegration(config, async (tokens) => {
    const nextConfig: GoogleCalendarConnectionConfig = {
      ...config,
      ...tokens,
    };
    Object.assign(config, nextConfig);
    await saveConnectionConfig({
      connectionId: connection.id,
      orgId: connection.orgId,
      userId: connection.userId,
      config: nextConfig,
      reason: "token_refresh",
    });
  });

  return {
    connection,
    config,
    integration,
    saveConfig: async (nextConfig: GoogleCalendarConnectionConfig) => {
      Object.assign(config, nextConfig);
      await saveConnectionConfig({
        connectionId: connection.id,
        orgId: connection.orgId,
        userId: connection.userId,
        config: nextConfig,
        reason: "manual_update",
      });
    },
  };
}

export { GOOGLE_CALENDAR_PROVIDER };
