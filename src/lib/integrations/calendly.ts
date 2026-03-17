import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";

const CALENDLY_API_BASE = "https://api.calendly.com";
export const CALENDLY_CHANNEL_TYPE = "CALENDLY";

export interface CalendlyUser {
  uri: string;
  name: string;
  email?: string | null;
  organizationUri: string;
}

export interface CalendlyEventType {
  uri: string;
  name: string;
  active: boolean;
  schedulingUrl?: string | null;
  slug?: string | null;
}

export interface CalendlyWebhookSubscription {
  uri: string;
  callbackUrl?: string | null;
  createdAt?: string | null;
}

export interface CalendlyChannelConfig {
  personalAccessToken: string;
  userUri?: string | null;
  userName?: string | null;
  organizationUri?: string | null;
  webhookSubscriptionUri?: string | null;
  webhookUrl?: string | null;
  eventTypes?: CalendlyEventType[];
  lastEventAt?: string | null;
}

function buildHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function normalizeConfig(config: CalendlyChannelConfig): CalendlyChannelConfig {
  return {
    personalAccessToken: config.personalAccessToken.trim(),
    userUri: typeof config.userUri === "string" ? config.userUri : null,
    userName: typeof config.userName === "string" ? config.userName : null,
    organizationUri:
      typeof config.organizationUri === "string" ? config.organizationUri : null,
    webhookSubscriptionUri:
      typeof config.webhookSubscriptionUri === "string"
        ? config.webhookSubscriptionUri
        : null,
    webhookUrl: typeof config.webhookUrl === "string" ? config.webhookUrl : null,
    eventTypes: Array.isArray(config.eventTypes)
      ? config.eventTypes
          .filter(
            (eventType): eventType is CalendlyEventType =>
              Boolean(eventType && typeof eventType.uri === "string")
          )
          .map((eventType) => ({
            uri: eventType.uri,
            name: eventType.name,
            active: Boolean(eventType.active),
            schedulingUrl:
              typeof eventType.schedulingUrl === "string"
                ? eventType.schedulingUrl
                : null,
            slug: typeof eventType.slug === "string" ? eventType.slug : null,
          }))
      : [],
    lastEventAt:
      typeof config.lastEventAt === "string" ? config.lastEventAt : null,
  };
}

async function calendlyRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
  query?: Record<string, string | undefined>
): Promise<T> {
  const url = new URL(`${CALENDLY_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      ...buildHeaders(token),
      ...(init?.headers || {}),
    },
  });

  if (response.status === 204) {
    return null as T;
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const title =
      typeof data.title === "string"
        ? data.title
        : typeof data.message === "string"
          ? data.message
          : "Calendly API request failed";
    throw new Error(title);
  }

  return data as T;
}

export function parseCalendlyConfig(config: string): CalendlyChannelConfig {
  try {
    return normalizeConfig(JSON.parse(decrypt(config)) as CalendlyChannelConfig);
  } catch {
    return normalizeConfig(JSON.parse(config) as CalendlyChannelConfig);
  }
}

export function serializeCalendlyConfig(config: CalendlyChannelConfig) {
  return encrypt(JSON.stringify(normalizeConfig(config)));
}

export async function getCurrentCalendlyUser(
  token: string
): Promise<CalendlyUser> {
  const data = await calendlyRequest<{ resource?: Record<string, unknown> }>(
    token,
    "/users/me"
  );

  const resource = data.resource || {};
  const organizationUri =
    typeof resource.current_organization === "string"
      ? resource.current_organization
      : null;

  if (!organizationUri) {
    throw new Error("Calendly user does not have an organization");
  }

  return {
    uri: String(resource.uri || ""),
    name: String(resource.name || "Calendly User"),
    email: typeof resource.email === "string" ? resource.email : null,
    organizationUri,
  };
}

export async function getEventTypes(token: string) {
  const user = await getCurrentCalendlyUser(token);
  const data = await calendlyRequest<{ collection?: Array<Record<string, unknown>> }>(
    token,
    "/event_types",
    undefined,
    {
      organization: user.organizationUri,
      user: user.uri,
      active: "true",
      count: "100",
      sort: "name:asc",
    }
  );

  const eventTypes = (data.collection || []).map((eventType) => ({
    uri: String(eventType.uri || ""),
    name: String(eventType.name || "Untitled Event"),
    active: Boolean(eventType.active),
    schedulingUrl:
      typeof eventType.scheduling_url === "string"
        ? eventType.scheduling_url
        : null,
    slug: typeof eventType.slug === "string" ? eventType.slug : null,
  }));

  return {
    user,
    eventTypes,
  };
}

export async function createWebhookSubscription(
  token: string,
  url: string,
  events: string[]
): Promise<CalendlyWebhookSubscription> {
  const { user } = await getEventTypes(token);
  const data = await calendlyRequest<{ resource?: Record<string, unknown> }>(
    token,
    "/webhook_subscriptions",
    {
      method: "POST",
      body: JSON.stringify({
        url,
        events,
        organization: user.organizationUri,
        user: user.uri,
        scope: "user",
      }),
    }
  );

  const resource = data.resource || {};
  return {
    uri: String(resource.uri || ""),
    callbackUrl:
      typeof resource.callback_url === "string" ? resource.callback_url : null,
    createdAt:
      typeof resource.created_at === "string" ? resource.created_at : null,
  };
}

export async function deleteWebhookSubscription(
  token: string,
  subscriptionUri: string
) {
  const subscriptionId = subscriptionUri.split("/").pop();
  if (!subscriptionId) {
    return;
  }

  await calendlyRequest<null>(token, `/webhook_subscriptions/${subscriptionId}`, {
    method: "DELETE",
  });
}

export async function getCalendlyIntegrationForAgent(agentId: string) {
  const channel = await prisma.agentChannel.findUnique({
    where: { agentId_type: { agentId, type: CALENDLY_CHANNEL_TYPE as never } },
  });

  if (!channel || !channel.isActive) {
    return null;
  }

  return {
    channel,
    config: parseCalendlyConfig(channel.config),
  };
}
