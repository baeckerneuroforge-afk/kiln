import { auth } from "@clerk/nextjs/server";
import { buildHubSpotAuthUrl } from "@/lib/integrations/hubspot";
import { encodeOAuthState } from "@/lib/integrations/oauth-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/dashboard/integrations";
  const agentId = url.searchParams.get("agentId") || undefined;
  const subOrgId = url.searchParams.get("subOrgId") || undefined;
  const state = encodeOAuthState({ userId, redirectTo, agentId, subOrgId });

  return Response.redirect(buildHubSpotAuthUrl(state));
}
