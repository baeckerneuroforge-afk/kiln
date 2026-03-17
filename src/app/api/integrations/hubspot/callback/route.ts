import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import {
  HUBSPOT_PROVIDER,
  HubSpotIntegration,
  exchangeHubSpotCode,
  getHubSpotConnection,
  type HubSpotConnectionConfig,
} from "@/lib/integrations/hubspot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return Response.redirect(`${appUrl}/dashboard/integrations?hubspot_error=${encodeURIComponent(error)}`);
    }

    if (!code || !stateParam) {
      return Response.redirect(`${appUrl}/dashboard/integrations?hubspot_error=missing_code`);
    }

    let state: { userId: string; redirectTo?: string; agentId?: string };
    try {
      state = JSON.parse(Buffer.from(stateParam, "base64url").toString()) as {
        userId: string;
        redirectTo?: string;
        agentId?: string;
      };
    } catch {
      return Response.redirect(`${appUrl}/dashboard/integrations?hubspot_error=invalid_state`);
    }

    const previousConnection = await getHubSpotConnection(state.userId);
    const previousConfig = previousConnection
      ? (JSON.parse(decrypt(previousConnection.config)) as HubSpotConnectionConfig)
      : null;

    const tokens = await exchangeHubSpotCode(code);
    const mergedConfig: HubSpotConnectionConfig = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || previousConfig?.refreshToken || null,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
      hubId: tokens.hubId,
      hubDomain: tokens.hubDomain,
      appId: tokens.appId,
      accountLabel: tokens.hubDomain || (tokens.hubId ? `Portal ${tokens.hubId}` : "HubSpot"),
    };

    const integration = new HubSpotIntegration(mergedConfig);
    await integration.listDealPipelines().catch(() => []);

    const encryptedConfig = encrypt(JSON.stringify(mergedConfig));

    if (previousConnection) {
      await prisma.integrationConnection.update({
        where: { id: previousConnection.id },
        data: {
          provider: HUBSPOT_PROVIDER,
          name: mergedConfig.accountLabel || "HubSpot",
          config: encryptedConfig,
          isActive: true,
          lastSyncAt: new Date(),
        },
      });
    } else {
      await prisma.integrationConnection.create({
        data: {
          userId: state.userId,
          provider: HUBSPOT_PROVIDER,
          name: mergedConfig.accountLabel || "HubSpot",
          config: encryptedConfig,
          isActive: true,
        },
      });
    }

    const redirect =
      state.agentId && state.agentId.trim()
        ? `/dashboard/agents/${state.agentId}?tab=channels&hubspot=connected`
        : state.redirectTo && state.redirectTo.startsWith("/")
        ? state.redirectTo
        : "/dashboard/integrations";

    return Response.redirect(
      `${appUrl}${redirect}${redirect.includes("?") ? "&" : "?"}hubspot=connected`
    );
  } catch (error) {
    console.error("HubSpot OAuth callback error:", error);
    return Response.redirect(`${appUrl}/dashboard/integrations?hubspot_error=oauth_failed`);
  }
}
