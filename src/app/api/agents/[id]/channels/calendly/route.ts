import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CALENDLY_CHANNEL_TYPE,
  createWebhookSubscription,
  deleteWebhookSubscription,
  getEventTypes,
  parseCalendlyConfig,
  serializeCalendlyConfig,
} from "@/lib/integrations/calendly";

export const dynamic = "force-dynamic";

const WEBHOOK_BASE = (process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com").replace(/\/+$/, "");
const CALENDLY_EVENTS = ["invitee.created", "invitee.canceled"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const personalAccessToken =
      typeof body.personalAccessToken === "string" ? body.personalAccessToken.trim() : "";

    if (!personalAccessToken) {
      return Response.json({ error: "Personal Access Token is required" }, { status: 400 });
    }

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const existing = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: CALENDLY_CHANNEL_TYPE as never } },
    });
    if (existing) {
      try {
        const existingConfig = parseCalendlyConfig(existing.config);
        if (existingConfig.webhookSubscriptionUri) {
          await deleteWebhookSubscription(
            existingConfig.personalAccessToken,
            existingConfig.webhookSubscriptionUri
          );
        }
      } catch {
        // Best-effort cleanup
      }
    }

    const { user, eventTypes } = await getEventTypes(personalAccessToken);
    const webhookUrl = `${WEBHOOK_BASE}/api/webhooks/calendly/${agentId}`;
    const subscription = await createWebhookSubscription(
      personalAccessToken,
      webhookUrl,
      CALENDLY_EVENTS
    );

    const config = {
      personalAccessToken,
      userUri: user.uri,
      userName: user.name,
      organizationUri: user.organizationUri,
      webhookSubscriptionUri: subscription.uri,
      webhookUrl,
      eventTypes,
      lastEventAt: null,
    };

    const channel = await prisma.agentChannel.upsert({
      where: { agentId_type: { agentId, type: CALENDLY_CHANNEL_TYPE as never } },
      create: {
        agentId,
        type: CALENDLY_CHANNEL_TYPE as never,
        config: serializeCalendlyConfig(config),
        isActive: true,
      },
      update: {
        config: serializeCalendlyConfig(config),
        isActive: true,
      },
    });

    return Response.json({
      success: true,
      channelId: channel.id,
      userName: user.name,
      webhookUrl,
      eventTypes,
      webhookSubscriptionUri: subscription.uri,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to connect Calendly";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: CALENDLY_CHANNEL_TYPE as never } },
    });

    if (!channel) {
      return Response.json({ connected: false });
    }

    const config = parseCalendlyConfig(channel.config);
    const { user, eventTypes } = await getEventTypes(config.personalAccessToken);

    return Response.json({
      connected: true,
      isActive: channel.isActive,
      userName: config.userName || user.name,
      webhookUrl: config.webhookUrl || `${WEBHOOK_BASE}/api/webhooks/calendly/${agentId}`,
      eventTypes,
      lastEventAt: config.lastEventAt || null,
      createdAt: channel.createdAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to verify Calendly connection";
    return Response.json({ connected: false, error: message }, { status: 200 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: CALENDLY_CHANNEL_TYPE as never } },
    });

    if (channel) {
      try {
        const config = parseCalendlyConfig(channel.config);
        if (config.webhookSubscriptionUri) {
          await deleteWebhookSubscription(
            config.personalAccessToken,
            config.webhookSubscriptionUri
          );
        }
      } catch {
        // Best-effort cleanup
      }

      await prisma.agentChannel.delete({ where: { id: channel.id } });
    }

    return Response.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disconnect Calendly";
    return Response.json({ error: message }, { status: 500 });
  }
}
