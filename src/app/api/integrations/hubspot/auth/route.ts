import { auth } from "@clerk/nextjs/server";
import { buildHubSpotAuthUrl } from "@/lib/integrations/hubspot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/dashboard/integrations";
  const agentId = url.searchParams.get("agentId") || "";
  const state = Buffer.from(
    JSON.stringify({
      userId,
      redirectTo,
      agentId,
    })
  ).toString("base64url");

  return Response.redirect(buildHubSpotAuthUrl(state));
}
