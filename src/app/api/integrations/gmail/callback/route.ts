import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { readConfigJson } from "@/lib/integrations/config-storage";
import { logAudit } from "@/lib/audit/logger";
import { decodeOAuthState } from "@/lib/integrations/oauth-state";
import { resolveOAuthTargetOrgId } from "@/lib/integrations/oauth-target";
import {
  GMAIL_PROVIDER,
  GmailIntegration,
  exchangeGmailCode,
  getGmailRedirectUri,
  type GmailConnectionConfig,
} from "@/lib/integrations/gmail";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com").replace(/\/+$/, "");

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return Response.redirect(`${appUrl}/dashboard/integrations?gmail_error=${encodeURIComponent(error)}`);
    }

    if (!code || !stateParam) {
      return Response.redirect(`${appUrl}/dashboard/integrations?gmail_error=missing_code`);
    }

    if (`${url.origin}${url.pathname}` !== getGmailRedirectUri()) {
      console.warn("Gmail callback hit an unexpected redirect URI", `${url.origin}${url.pathname}`, getGmailRedirectUri());
    }

    const state = decodeOAuthState(stateParam);
    if (!state) {
      return Response.redirect(`${appUrl}/dashboard/integrations?gmail_error=invalid_state`);
    }

    // Resolve which Clerk org this connection should land in. The agency
    // fallback is the user's current active Clerk org from auth() — this
    // also matters when the user hits /callback in a different tab than
    // /auth (Clerk session is fresh, state.subOrgId is still authoritative).
    const { orgId: activeOrgId } = await auth();
    const target = await resolveOAuthTargetOrgId({
      userId: state.userId,
      agencyOrgId: activeOrgId,
      subOrgId: state.subOrgId,
    });
    if (!target.ok) {
      return Response.redirect(`${appUrl}/dashboard/integrations?gmail_error=${target.status === 404 ? "sub_org_not_found" : "forbidden"}`);
    }

    const previousConnection = await prisma.integrationConnection.findFirst({
      where: { userId: state.userId, orgId: target.orgId, provider: GMAIL_PROVIDER },
    });
    const previousConfig = previousConnection
      ? readConfigJson<GmailConnectionConfig>(previousConnection.config).data
      : null;

    const tokens = await exchangeGmailCode(code);
    const mergedConfig: GmailConnectionConfig = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || previousConfig?.refreshToken || null,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
      email: previousConfig?.email || null,
    };

    const integration = new GmailIntegration(mergedConfig);
    try {
      const profile = await integration.getProfile();
      mergedConfig.email = profile.emailAddress;
    } catch {
      // Profil konnte nicht geladen werden — weiter ohne E-Mail
    }

    const encryptedConfig = encrypt(JSON.stringify(mergedConfig));

    let connectionId: string;
    if (previousConnection) {
      await prisma.integrationConnection.update({
        where: { id: previousConnection.id },
        data: {
          provider: GMAIL_PROVIDER,
          name: mergedConfig.email ? `Gmail (${mergedConfig.email})` : "Gmail",
          config: encryptedConfig,
          isActive: true,
          lastSyncAt: new Date(),
          orgId: target.orgId,
        },
      });
      connectionId = previousConnection.id;
    } else {
      const created = await prisma.integrationConnection.create({
        data: {
          userId: state.userId,
          orgId: target.orgId,
          provider: GMAIL_PROVIDER,
          name: mergedConfig.email ? `Gmail (${mergedConfig.email})` : "Gmail",
          config: encryptedConfig,
          isActive: true,
        },
      });
      connectionId = created.id;
    }

    await logAudit({
      orgId: target.orgId ?? state.userId,
      actorUserId: state.userId,
      action: "INTEGRATION_CONNECTED",
      resourceType: "INTEGRATION_CONNECTION",
      resourceId: connectionId,
      description: `Gmail OAuth completed${mergedConfig.email ? ` (${mergedConfig.email})` : ""}`,
      severity: "INFO",
      metadata: {
        provider: GMAIL_PROVIDER,
        hasRefreshToken: !!mergedConfig.refreshToken,
        subOrgId: target.usedSubOrg?.subOrgId,
      },
    });

    // Sub-org flows bounce back to the sub-org integrations page when we
    // know we came from one; agency flows fall back to the redirectTo.
    const subOrgRedirect = target.usedSubOrg
      ? `/dashboard/sub-org/${target.usedSubOrg.subOrgId}/integrations`
      : null;
    const redirectTo = subOrgRedirect || state.redirectTo || "/dashboard/integrations";
    const redirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard/integrations";
    return Response.redirect(`${appUrl}${redirect}${redirect.includes("?") ? "&" : "?"}gmail=connected`);
  } catch (error) {
    console.error("Gmail OAuth callback error:", error);
    return Response.redirect(`${appUrl}/dashboard/integrations?gmail_error=oauth_failed`);
  }
}
