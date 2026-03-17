import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import {
  GOOGLE_SHEETS_PROVIDER,
  GoogleSheetsIntegration,
  exchangeGoogleSheetsCode,
  getGoogleSheetsConnection,
  getGoogleSheetsRedirectUri,
  type GoogleSheetsConnectionConfig,
} from "@/lib/integrations/google-sheets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com").replace(/\/+$/, "");

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return Response.redirect(`${appUrl}/dashboard/integrations?google_sheets_error=${encodeURIComponent(error)}`);
    }

    if (!code || !stateParam) {
      return Response.redirect(`${appUrl}/dashboard/integrations?google_sheets_error=missing_code`);
    }

    if (`${url.origin}${url.pathname}` !== getGoogleSheetsRedirectUri()) {
      console.warn("Google Sheets callback URI mismatch", `${url.origin}${url.pathname}`, getGoogleSheetsRedirectUri());
    }

    let state: { userId: string; redirectTo?: string };
    try {
      state = JSON.parse(Buffer.from(stateParam, "base64url").toString()) as { userId: string; redirectTo?: string };
    } catch {
      return Response.redirect(`${appUrl}/dashboard/integrations?google_sheets_error=invalid_state`);
    }

    const previousConnection = await getGoogleSheetsConnection(state.userId);
    const previousConfig = previousConnection
      ? (JSON.parse(decrypt(previousConnection.config)) as GoogleSheetsConnectionConfig)
      : null;

    const tokens = await exchangeGoogleSheetsCode(code);
    const mergedConfig: GoogleSheetsConnectionConfig = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || previousConfig?.refreshToken || null,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
      email: previousConfig?.email || null,
    };

    // E-Mail-Adresse ermitteln
    const integration = new GoogleSheetsIntegration(mergedConfig);
    try {
      mergedConfig.email = await integration.getEmail();
    } catch {
      // Weiter ohne E-Mail
    }

    const encryptedConfig = encrypt(JSON.stringify(mergedConfig));
    const displayName = mergedConfig.email ? `Google Sheets (${mergedConfig.email})` : "Google Sheets";

    if (previousConnection) {
      await prisma.integrationConnection.update({
        where: { id: previousConnection.id },
        data: {
          provider: GOOGLE_SHEETS_PROVIDER,
          name: displayName,
          config: encryptedConfig,
          isActive: true,
          lastSyncAt: new Date(),
        },
      });
    } else {
      await prisma.integrationConnection.create({
        data: {
          userId: state.userId,
          provider: GOOGLE_SHEETS_PROVIDER,
          name: displayName,
          config: encryptedConfig,
          isActive: true,
        },
      });
    }

    const redirectTo = state.redirectTo || "/dashboard/integrations";
    const redirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard/integrations";
    return Response.redirect(`${appUrl}${redirect}${redirect.includes("?") ? "&" : "?"}google_sheets=connected`);
  } catch (error) {
    console.error("Google Sheets OAuth callback error:", error);
    return Response.redirect(`${appUrl}/dashboard/integrations?google_sheets_error=oauth_failed`);
  }
}
