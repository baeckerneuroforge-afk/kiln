import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { exchangeNotionCode } from "@/lib/integrations/notion";
import { decodeOAuthState } from "@/lib/integrations/oauth-state";
import { resolveOAuthTargetOrgId } from "@/lib/integrations/oauth-target";

export const dynamic = "force-dynamic";

const NOTION_PROVIDER = "notion";

// GET: Notion OAuth callback — exchanges code for tokens, saves connection
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return Response.redirect(`${appUrl}/dashboard/integrations?notion_error=${encodeURIComponent(error)}`);
    }

    if (!code || !stateParam) {
      return Response.redirect(`${appUrl}/dashboard/integrations?notion_error=missing_code`);
    }

    const state = decodeOAuthState(stateParam);
    if (!state) {
      return Response.redirect(`${appUrl}/dashboard/integrations?notion_error=invalid_state`);
    }

    const { orgId: activeOrgId } = await auth();
    const target = await resolveOAuthTargetOrgId({
      userId: state.userId,
      agencyOrgId: activeOrgId,
      subOrgId: state.subOrgId,
    });
    if (!target.ok) {
      return Response.redirect(`${appUrl}/dashboard/integrations?notion_error=${target.status === 404 ? "sub_org_not_found" : "forbidden"}`);
    }

    // Exchange code for tokens
    const tokens = await exchangeNotionCode(code);

    const encryptedConfig = encrypt(JSON.stringify({
      accessToken: tokens.accessToken,
      workspaceId: tokens.workspaceId,
      workspaceName: tokens.workspaceName,
      workspaceIcon: tokens.workspaceIcon,
      botId: tokens.botId,
    }));

    const previous = await prisma.integrationConnection.findFirst({
      where: { userId: state.userId, orgId: target.orgId, provider: NOTION_PROVIDER },
    });
    if (previous) {
      await prisma.integrationConnection.update({
        where: { id: previous.id },
        data: {
          name: `Notion — ${tokens.workspaceName}`,
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
          provider: NOTION_PROVIDER,
          name: `Notion — ${tokens.workspaceName}`,
          config: encryptedConfig,
          isActive: true,
        },
      });
    }

    const subOrgRedirect = target.usedSubOrg
      ? `/dashboard/sub-org/${target.usedSubOrg.subOrgId}/integrations?notion=connected`
      : null;
    const redirect = subOrgRedirect
      ? subOrgRedirect
      : state.agentId
        ? `/dashboard/agents/${state.agentId}?tab=channels&notion=connected`
        : `/dashboard/integrations?notion=connected`;

    return Response.redirect(`${appUrl}${redirect}`);
  } catch (err) {
    console.error("Notion OAuth callback error:", err);
    return Response.redirect(`${appUrl}/dashboard/integrations?notion_error=oauth_failed`);
  }
}
