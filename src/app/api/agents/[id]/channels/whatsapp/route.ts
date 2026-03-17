import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { verifyPhoneNumber } from "@/lib/integrations/whatsapp";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const WEBHOOK_BASE = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

// POST: Connect WhatsApp Business — saves encrypted config
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const { phoneNumberId, accessToken } = await req.json();

    if (!phoneNumberId || typeof phoneNumberId !== "string") {
      return Response.json({ error: "Phone Number ID is required" }, { status: 400 });
    }
    if (!accessToken || typeof accessToken !== "string") {
      return Response.json({ error: "Access Token is required" }, { status: 400 });
    }

    // Verify agent ownership
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    // Validate phone number ID with Meta API
    const verification = await verifyPhoneNumber(phoneNumberId, accessToken);
    if (!verification.valid) {
      return Response.json(
        { error: verification.error || "Invalid Phone Number ID or Access Token. Please check your credentials." },
        { status: 400 }
      );
    }

    // Build webhook URL for setup instructions
    const webhookUrl = `${WEBHOOK_BASE}/api/webhooks/whatsapp/${agentId}`;

    // Encrypt and save channel config
    const configData = {
      phoneNumberId,
      accessToken,
      displayNumber: verification.displayNumber,
    };

    const channel = await prisma.agentChannel.upsert({
      where: { agentId_type: { agentId, type: "WHATSAPP" } },
      create: {
        agentId,
        type: "WHATSAPP",
        config: encrypt(JSON.stringify(configData)),
        isActive: true,
      },
      update: {
        config: encrypt(JSON.stringify(configData)),
        isActive: true,
      },
    });

    return Response.json({
      success: true,
      displayNumber: verification.displayNumber,
      webhookUrl,
      channelId: channel.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Disconnect WhatsApp channel
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "WHATSAPP" } },
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

// GET: Check WhatsApp channel status
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "WHATSAPP" } },
    });

    if (!channel) {
      return Response.json({ connected: false });
    }

    const config = JSON.parse(decrypt(channel.config)) as {
      phoneNumberId?: string;
      displayNumber?: string;
    };

    // Get last message time from conversations
    const lastConversation = await prisma.conversation.findFirst({
      where: { agentId, channel: "WHATSAPP" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    // Count total WhatsApp conversations
    const totalConversations = await prisma.conversation.count({
      where: { agentId, channel: "WHATSAPP" },
    });

    const webhookUrl = `${WEBHOOK_BASE}/api/webhooks/whatsapp/${agentId}`;

    return Response.json({
      connected: true,
      isActive: channel.isActive,
      displayNumber: config.displayNumber || config.phoneNumberId || null,
      webhookUrl,
      lastMessageAt: lastConversation?.updatedAt || null,
      totalConversations,
      createdAt: channel.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
