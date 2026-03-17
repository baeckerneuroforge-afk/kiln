import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const TELEGRAM_API = "https://api.telegram.org";
const WEBHOOK_BASE = (process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com").replace(/\/+$/, "");

function parseTelegramConfig(config: string): { botToken: string; botUsername?: string | null } {
  try {
    return JSON.parse(decrypt(config)) as { botToken: string; botUsername?: string | null };
  } catch {
    return JSON.parse(config) as { botToken: string; botUsername?: string | null };
  }
}

// POST: Connect Telegram bot — saves token and registers webhook
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const { botToken } = await req.json();
    if (!botToken || typeof botToken !== "string") {
      return Response.json({ error: "Bot token required" }, { status: 400 });
    }

    // Verify agent ownership
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    // Validate token with Telegram getMe
    const meRes = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      return Response.json({ error: "Invalid bot token. Please check and try again." }, { status: 400 });
    }

    const botUsername = meData.result.username;

    // Register webhook with Telegram
    const webhookUrl = `${WEBHOOK_BASE}/api/webhooks/telegram/${agentId}`;
    const whRes = await fetch(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const whData = await whRes.json();
    if (!whData.ok) {
      return Response.json({ error: `Failed to set webhook: ${whData.description || "Unknown error"}` }, { status: 500 });
    }

    // Save channel config (upsert)
    const channel = await prisma.agentChannel.upsert({
      where: { agentId_type: { agentId, type: "TELEGRAM" } },
      create: {
        agentId,
        type: "TELEGRAM",
        config: encrypt(JSON.stringify({ botToken, botUsername })),
        isActive: true,
      },
      update: {
        config: encrypt(JSON.stringify({ botToken, botUsername })),
        isActive: true,
      },
    });

    return Response.json({
      success: true,
      botUsername,
      channelId: channel.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Disconnect Telegram bot — removes webhook and deactivates
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "TELEGRAM" } },
    });

    if (channel) {
      // Remove webhook from Telegram
      try {
        const config = parseTelegramConfig(channel.config);
        await fetch(`${TELEGRAM_API}/bot${config.botToken}/deleteWebhook`);
      } catch {
        // Best-effort cleanup
      }

      await prisma.agentChannel.delete({ where: { id: channel.id } });
    }

    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// GET: Check Telegram channel status
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "TELEGRAM" } },
    });

    if (!channel) {
      return Response.json({ connected: false });
    }

    const config = parseTelegramConfig(channel.config);
    return Response.json({
      connected: true,
      isActive: channel.isActive,
      botUsername: config.botUsername || null,
      createdAt: channel.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
