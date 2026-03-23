import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";

// GET: Redirect to Slack OAuth — starts the install flow
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "Slack integration not configured" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
  const redirectUri = `${appUrl}/api/integrations/slack/callback`;

  // Pass agentId through state param so we know which agent to connect after OAuth
  const agentId = request.nextUrl.searchParams.get("agentId") || "";
  const state = Buffer.from(JSON.stringify({ userId, agentId })).toString("base64url");

  const scopes = [
    "channels:history",
    "channels:join",
    "channels:read",
    "chat:write",
    "groups:history",
    "groups:read",
    "users:read",
    "users:read.email",
  ].join(",");

  const slackUrl = new URL("https://slack.com/oauth/v2/authorize");
  slackUrl.searchParams.set("client_id", clientId);
  slackUrl.searchParams.set("scope", scopes);
  slackUrl.searchParams.set("redirect_uri", redirectUri);
  slackUrl.searchParams.set("state", state);

  return Response.redirect(slackUrl.toString());
}
