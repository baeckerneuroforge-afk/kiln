import crypto from "crypto";

const SLACK_API = "https://slack.com/api";

export interface SlackTokens {
  accessToken: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  scope: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isMember: boolean;
  isPrivate: boolean;
  numMembers?: number;
}

export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  threadTs?: string;
}

// Verify Slack request signature (HMAC-SHA256)
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const computed = `v0=${hmac}`;

  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

// Exchange OAuth code for tokens
export async function exchangeSlackCode(code: string): Promise<SlackTokens> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Slack OAuth not configured");

  const res = await fetch(`${SLACK_API}/oauth.v2.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(`Slack OAuth failed: ${data.error}`);

  return {
    accessToken: data.access_token,
    teamId: data.team.id,
    teamName: data.team.name,
    botUserId: data.bot_user_id,
    scope: data.scope,
  };
}

// Send a message to a Slack channel
export async function sendSlackMessage(
  accessToken: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const body: Record<string, string> = { channel, text };
  if (threadTs) body.thread_ts = threadTs;

  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return res.json();
}

// List channels the bot has access to
export async function listSlackChannels(accessToken: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;

  // Paginate through all channels (max 3 pages to avoid excessive API calls)
  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "200",
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${SLACK_API}/conversations.list?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json();
    if (!data.ok) throw new Error(`Slack API error: ${data.error}`);

    for (const ch of data.channels || []) {
      channels.push({
        id: ch.id,
        name: ch.name,
        isMember: ch.is_member || false,
        isPrivate: ch.is_private || false,
        numMembers: ch.num_members,
      });
    }

    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return channels;
}

// Join a channel so the bot can post
export async function joinSlackChannel(
  accessToken: string,
  channelId: string
): Promise<boolean> {
  const res = await fetch(`${SLACK_API}/conversations.join`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId }),
  });

  const data = await res.json();
  return data.ok;
}

// Get user info for display name
export async function getSlackUserInfo(
  accessToken: string,
  userId: string
): Promise<{ name: string; email?: string }> {
  const res = await fetch(`${SLACK_API}/users.info?user=${userId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();
  if (!data.ok) return { name: "User" };

  const user = data.user;
  return {
    name: user.real_name || user.profile?.display_name || user.name || "User",
    email: user.profile?.email,
  };
}
