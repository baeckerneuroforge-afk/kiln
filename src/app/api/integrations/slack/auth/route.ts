import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { encodeOAuthState } from "@/lib/integrations/oauth-state";

export const dynamic = "force-dynamic";

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

  // Carry agentId + subOrgId through state so the callback can return to
  // the right page and persist under the right org.
  const agentId = request.nextUrl.searchParams.get("agentId") || undefined;
  const subOrgId = request.nextUrl.searchParams.get("subOrgId") || undefined;
  const state = encodeOAuthState({ userId, agentId, subOrgId });

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
