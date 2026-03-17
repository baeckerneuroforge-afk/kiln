import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AIRTABLE_CHANNEL_TYPE,
  parseAirtableConfig,
  serializeAirtableConfig,
  verifyAirtableAccess,
} from "@/lib/integrations/airtable";

export const dynamic = "force-dynamic";

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
    const baseId = typeof body.baseId === "string" ? body.baseId.trim() : "";
    const tableName = typeof body.tableName === "string" ? body.tableName.trim() : "";

    if (!personalAccessToken) {
      return Response.json({ error: "Personal Access Token is required" }, { status: 400 });
    }
    if (!baseId) {
      return Response.json({ error: "Base ID is required" }, { status: 400 });
    }
    if (!tableName) {
      return Response.json({ error: "Table Name is required" }, { status: 400 });
    }

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const verification = await verifyAirtableAccess(personalAccessToken, baseId, tableName);
    const config = {
      personalAccessToken,
      baseId,
      tableName,
      sampleFieldNames: verification.sampleFieldNames,
    };

    const channel = await prisma.agentChannel.upsert({
      where: { agentId_type: { agentId, type: AIRTABLE_CHANNEL_TYPE as never } },
      create: {
        agentId,
        type: AIRTABLE_CHANNEL_TYPE as never,
        config: serializeAirtableConfig(config),
        isActive: true,
      },
      update: {
        config: serializeAirtableConfig(config),
        isActive: true,
      },
    });

    return Response.json({
      success: true,
      channelId: channel.id,
      baseId,
      tableName,
      sampleFieldNames: verification.sampleFieldNames,
      previewCount: verification.previewCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to connect Airtable";
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
      where: { agentId_type: { agentId, type: AIRTABLE_CHANNEL_TYPE as never } },
    });

    if (!channel) {
      return Response.json({ connected: false });
    }

    const config = parseAirtableConfig(channel.config);
    const verification = await verifyAirtableAccess(
      config.personalAccessToken,
      config.baseId,
      config.tableName
    );

    return Response.json({
      connected: true,
      isActive: channel.isActive,
      baseId: config.baseId,
      tableName: config.tableName,
      sampleFieldNames: verification.sampleFieldNames,
      previewCount: verification.previewCount,
      createdAt: channel.createdAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to verify Airtable connection";
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
      where: { agentId_type: { agentId, type: AIRTABLE_CHANNEL_TYPE as never } },
    });

    if (channel) {
      await prisma.agentChannel.delete({ where: { id: channel.id } });
    }

    return Response.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disconnect Airtable";
    return Response.json({ error: message }, { status: 500 });
  }
}
