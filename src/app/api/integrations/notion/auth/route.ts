import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { encodeOAuthState } from "@/lib/integrations/oauth-state";

export const dynamic = "force-dynamic";

// GET: Redirect to Notion OAuth — starts the install flow
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  const redirectUri = process.env.NOTION_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return Response.json({ error: "Notion integration not configured" }, { status: 500 });
  }

  const agentId = request.nextUrl.searchParams.get("agentId") || undefined;
  const subOrgId = request.nextUrl.searchParams.get("subOrgId") || undefined;
  const state = encodeOAuthState({ userId, agentId, subOrgId });

  const notionUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  notionUrl.searchParams.set("client_id", clientId);
  notionUrl.searchParams.set("redirect_uri", redirectUri);
  notionUrl.searchParams.set("response_type", "code");
  notionUrl.searchParams.set("owner", "user");
  notionUrl.searchParams.set("state", state);

  return Response.redirect(notionUrl.toString());
}
