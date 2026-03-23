import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { exchangeNotionCode } from "@/lib/integrations/notion";

// GET: Notion OAuth callback — exchanges code for tokens, saves connection
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

    if (error) {
      return Response.redirect(`${appUrl}/dashboard/integrations?notion_error=${encodeURIComponent(error)}`);
    }

    if (!code || !stateParam) {
      return Response.redirect(`${appUrl}/dashboard/integrations?notion_error=missing_code`);
    }

    // Decode state
    let state: { userId: string; agentId?: string };
    try {
      state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
    } catch {
      return Response.redirect(`${appUrl}/dashboard/integrations?notion_error=invalid_state`);
    }

    // Exchange code for tokens
    const tokens = await exchangeNotionCode(code);

    // Save as IntegrationConnection (user-level)
    const encryptedConfig = encrypt(JSON.stringify({
      accessToken: tokens.accessToken,
      workspaceId: tokens.workspaceId,
      workspaceName: tokens.workspaceName,
      workspaceIcon: tokens.workspaceIcon,
      botId: tokens.botId,
    }));

    await prisma.integrationConnection.upsert({
      where: { userId_provider: { userId: state.userId, provider: "notion" } },
      create: {
        userId: state.userId,
        provider: "notion",
        name: `Notion — ${tokens.workspaceName}`,
        config: encryptedConfig,
        isActive: true,
      },
      update: {
        name: `Notion — ${tokens.workspaceName}`,
        config: encryptedConfig,
        isActive: true,
        lastSyncAt: new Date(),
      },
    });

    // Redirect back
    const redirect = state.agentId
      ? `${appUrl}/dashboard/agents/${state.agentId}?tab=channels&notion=connected`
      : `${appUrl}/dashboard/integrations?notion=connected`;

    return Response.redirect(redirect);
  } catch (err) {
    console.error("Notion OAuth callback error:", err);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
    return Response.redirect(`${appUrl}/dashboard/integrations?notion_error=oauth_failed`);
  }
}
