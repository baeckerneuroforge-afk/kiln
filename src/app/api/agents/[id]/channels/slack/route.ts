import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import { NextRequest } from "next/server";
import { listSlackChannels, joinSlackChannel } from "@/lib/integrations/slack";

// POST: Connect Slack channel to agent — stores channel config and joins the channel
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const { channelId, channelName } = await req.json();

    if (!channelId || !channelName) {
      return Response.json({ error: "Channel selection required" }, { status: 400 });
    }

    // Verify agent ownership
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    // Load Slack integration connection (user-level)
    const connection = await prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: "slack" } },
    });

    if (!connection || !connection.isActive) {
      return Response.json({ error: "Slack not connected. Please connect Slack first in Integration Hub." }, { status: 400 });
    }

    const slackConfig = JSON.parse(decrypt(connection.config)) as {
      accessToken: string;
      teamId: string;
      teamName: string;
      botUserId: string;
    };

    // Join the channel
    await joinSlackChannel(slackConfig.accessToken, channelId);

    // Save agent channel config
    const channelConfig = encrypt(JSON.stringify({
      accessToken: slackConfig.accessToken,
      channelId,
      channelName,
      teamId: slackConfig.teamId,
      teamName: slackConfig.teamName,
      botUserId: slackConfig.botUserId,
    }));

    const agentChannel = await prisma.agentChannel.upsert({
      where: { agentId_type: { agentId, type: "SLACK" } },
      create: {
        agentId,
        type: "SLACK",
        config: channelConfig,
        isActive: true,
      },
      update: {
        config: channelConfig,
        isActive: true,
      },
    });

    return Response.json({
      success: true,
      channelId: agentChannel.id,
      channelName,
      teamName: slackConfig.teamName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Disconnect Slack channel from agent
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "SLACK" } },
    });

    if (channel) {
      await prisma.agentChannel.delete({ where: { id: channel.id } });
    }

    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// GET: Check Slack channel status + list available channels
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    // Check if Slack is connected at user level
    const connection = await prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: "slack" } },
    });

    if (!connection || !connection.isActive) {
      return Response.json({ connected: false, slackConnected: false });
    }

    // Check if agent has a Slack channel configured
    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "SLACK" } },
    });

    if (!channel) {
      // Slack is connected but no channel assigned yet — list available channels
      const listChannels = req.nextUrl.searchParams.get("listChannels") === "true";
      let channels: { id: string; name: string; isMember: boolean; isPrivate: boolean }[] = [];

      if (listChannels) {
        try {
          const slackConfig = JSON.parse(decrypt(connection.config)) as { accessToken: string; teamName: string };
          channels = await listSlackChannels(slackConfig.accessToken);
        } catch {
          // Failed to list channels
        }
      }

      const slackConfig = JSON.parse(decrypt(connection.config)) as { teamName: string };
      return Response.json({
        connected: false,
        slackConnected: true,
        teamName: slackConfig.teamName,
        channels,
      });
    }

    const config = JSON.parse(decrypt(channel.config)) as {
      channelName?: string;
      teamName?: string;
    };

    return Response.json({
      connected: true,
      slackConnected: true,
      isActive: channel.isActive,
      channelName: config.channelName || null,
      teamName: config.teamName || null,
      createdAt: channel.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
