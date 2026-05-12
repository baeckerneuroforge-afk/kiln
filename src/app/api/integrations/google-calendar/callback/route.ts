import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import { decodeOAuthState } from "@/lib/integrations/oauth-state";
import { resolveOAuthTargetOrgId } from "@/lib/integrations/oauth-target";
import {
  GOOGLE_CALENDAR_PROVIDER,
  GoogleCalendarIntegration,
  exchangeGoogleCalendarCode,
  getGoogleCalendarRedirectUri,
  type GoogleCalendarConnectionConfig,
} from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com").replace(/\/+$/, "");

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return Response.redirect(`${appUrl}/dashboard/integrations?google_calendar_error=${encodeURIComponent(error)}`);
    }

    if (!code || !stateParam) {
      return Response.redirect(`${appUrl}/dashboard/integrations?google_calendar_error=missing_code`);
    }

    if (`${url.origin}${url.pathname}` !== getGoogleCalendarRedirectUri()) {
      console.warn(
        "Google Calendar callback hit an unexpected redirect URI",
        `${url.origin}${url.pathname}`,
        getGoogleCalendarRedirectUri()
      );
    }

    const state = decodeOAuthState(stateParam);
    if (!state) {
      return Response.redirect(`${appUrl}/dashboard/integrations?google_calendar_error=invalid_state`);
    }

    const { orgId: activeOrgId } = await auth();
    const target = await resolveOAuthTargetOrgId({
      userId: state.userId,
      agencyOrgId: activeOrgId,
      subOrgId: state.subOrgId,
    });
    if (!target.ok) {
      return Response.redirect(`${appUrl}/dashboard/integrations?google_calendar_error=${target.status === 404 ? "sub_org_not_found" : "forbidden"}`);
    }

    const previousConnection = await prisma.integrationConnection.findFirst({
      where: { userId: state.userId, orgId: target.orgId, provider: GOOGLE_CALENDAR_PROVIDER },
    });
    const previousConfig = previousConnection
      ? (JSON.parse(decrypt(previousConnection.config)) as GoogleCalendarConnectionConfig)
      : null;

    const tokens = await exchangeGoogleCalendarCode(code);
    const mergedConfig: GoogleCalendarConnectionConfig = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || previousConfig?.refreshToken || null,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
      selectedCalendarId: previousConfig?.selectedCalendarId || null,
      selectedCalendarName: previousConfig?.selectedCalendarName || null,
    };

    const integration = new GoogleCalendarIntegration(mergedConfig);
    const calendars = await integration.listCalendars();
    const selectedCalendar =
      calendars.find((calendar) => calendar.id === mergedConfig.selectedCalendarId) ||
      calendars.find((calendar) => calendar.primary) ||
      calendars[0] ||
      null;

    if (selectedCalendar) {
      mergedConfig.selectedCalendarId = selectedCalendar.id;
      mergedConfig.selectedCalendarName = selectedCalendar.summary;
    }

    const encryptedConfig = encrypt(JSON.stringify(mergedConfig));

    if (previousConnection) {
      await prisma.integrationConnection.update({
        where: { id: previousConnection.id },
        data: {
          provider: GOOGLE_CALENDAR_PROVIDER,
          name: "Google Calendar",
          config: encryptedConfig,
          isActive: true,
          lastSyncAt: new Date(),
          orgId: target.orgId,
        },
      });
    } else {
      await prisma.integrationConnection.create({
        data: {
          userId: state.userId,
          orgId: target.orgId,
          provider: GOOGLE_CALENDAR_PROVIDER,
          name: "Google Calendar",
          config: encryptedConfig,
          isActive: true,
        },
      });
    }

    const subOrgRedirect = target.usedSubOrg
      ? `/dashboard/sub-org/${target.usedSubOrg.subOrgId}/integrations`
      : null;
    const redirectTo = subOrgRedirect || state.redirectTo || "/dashboard/integrations";
    const redirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard/integrations";

    return Response.redirect(`${appUrl}${redirect}${redirect.includes("?") ? "&" : "?"}google_calendar=connected`);
  } catch (error) {
    console.error("Google Calendar OAuth callback error:", error);
    return Response.redirect(`${appUrl}/dashboard/integrations?google_calendar_error=oauth_failed`);
  }
}
