import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

const EMAIL_DOMAIN = "getkiln.com";

// POST: Enable email channel — saves forwarding address config
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const { forwardingEmail } = await req.json();

    // Verify agent ownership
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    // Validate forwarding email (optional)
    if (forwardingEmail && typeof forwardingEmail === "string") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(forwardingEmail)) {
        return Response.json({ error: "Invalid forwarding email address" }, { status: 400 });
      }
    }

    const agentEmail = `${agent.slug}@${EMAIL_DOMAIN}`;

    // Save channel config (upsert)
    const channel = await prisma.agentChannel.upsert({
      where: { agentId_type: { agentId, type: "EMAIL" } },
      create: {
        agentId,
        type: "EMAIL",
        config: JSON.stringify({
          agentEmail,
          forwardingEmail: forwardingEmail || null,
          dailyCount: 0,
          dailyCountDate: new Date().toISOString().slice(0, 10),
        }),
        isActive: true,
      },
      update: {
        config: JSON.stringify({
          agentEmail,
          forwardingEmail: forwardingEmail || null,
          dailyCount: 0,
          dailyCountDate: new Date().toISOString().slice(0, 10),
        }),
        isActive: true,
      },
    });

    return Response.json({
      success: true,
      agentEmail,
      channelId: channel.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Disconnect email channel
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "EMAIL" } },
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

// GET: Check email channel status
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "EMAIL" } },
    });

    if (!channel) {
      return Response.json({
        connected: false,
        agentEmail: `${agent.slug}@${EMAIL_DOMAIN}`,
      });
    }

    const config = JSON.parse(channel.config) as {
      agentEmail?: string;
      forwardingEmail?: string | null;
      lastEmailAt?: string | null;
    };

    // Count today's emails
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const emailsToday = await prisma.conversation.count({
      where: {
        agentId,
        channel: "EMAIL",
        createdAt: { gte: today },
      },
    });

    return Response.json({
      connected: true,
      isActive: channel.isActive,
      agentEmail: config.agentEmail || `${agent.slug}@${EMAIL_DOMAIN}`,
      forwardingEmail: config.forwardingEmail || null,
      lastEmailAt: config.lastEmailAt || null,
      emailsToday,
      createdAt: channel.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
