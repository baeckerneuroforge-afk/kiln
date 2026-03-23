import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { exchangeSlackCode } from "@/lib/integrations/slack";

// GET: Slack OAuth callback — exchanges code for tokens, saves connection
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

    if (error) {
      return Response.redirect(`${appUrl}/dashboard/integrations?slack_error=${encodeURIComponent(error)}`);
    }

    if (!code || !stateParam) {
      return Response.redirect(`${appUrl}/dashboard/integrations?slack_error=missing_code`);
    }

    // Decode state
    let state: { userId: string; agentId?: string };
    try {
      state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
    } catch {
      return Response.redirect(`${appUrl}/dashboard/integrations?slack_error=invalid_state`);
    }

    // Exchange code for tokens
    const tokens = await exchangeSlackCode(code);

    // Save as IntegrationConnection (user-level, one per provider)
    const encryptedConfig = encrypt(JSON.stringify({
      accessToken: tokens.accessToken,
      teamId: tokens.teamId,
      teamName: tokens.teamName,
      botUserId: tokens.botUserId,
      scope: tokens.scope,
    }));

    await prisma.integrationConnection.upsert({
      where: { userId_provider: { userId: state.userId, provider: "slack" } },
      create: {
        userId: state.userId,
        provider: "slack",
        name: `Slack — ${tokens.teamName}`,
        config: encryptedConfig,
        isActive: true,
      },
      update: {
        name: `Slack — ${tokens.teamName}`,
        config: encryptedConfig,
        isActive: true,
        lastSyncAt: new Date(),
      },
    });

    // If agentId was provided, redirect to agent channels tab
    const redirect = state.agentId
      ? `${appUrl}/dashboard/agents/${state.agentId}?tab=channels&slack=connected`
      : `${appUrl}/dashboard/integrations?slack=connected`;

    return Response.redirect(redirect);
  } catch (err) {
    console.error("Slack OAuth callback error:", err);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
    return Response.redirect(`${appUrl}/dashboard/integrations?slack_error=oauth_failed`);
  }
}
