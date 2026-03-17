import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  serializeStripeConfig,
  verifyStripeSecretKey,
  STRIPE_CHANNEL_TYPE,
  parseStripeConfig,
} from "@/lib/integrations/agent-stripe";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const { secretKey } = await req.json();

    if (!secretKey || typeof secretKey !== "string") {
      return Response.json({ error: "Stripe Secret Key is required" }, { status: 400 });
    }

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const verification = await verifyStripeSecretKey(secretKey.trim());
    const config = {
      secretKey: secretKey.trim(),
      accountId: verification.accountId,
      accountLabel: verification.accountLabel,
    };

    const channel = await prisma.agentChannel.upsert({
      where: { agentId_type: { agentId, type: STRIPE_CHANNEL_TYPE as never } },
      create: {
        agentId,
        type: STRIPE_CHANNEL_TYPE as never,
        config: serializeStripeConfig(config),
        isActive: true,
      },
      update: {
        config: serializeStripeConfig(config),
        isActive: true,
      },
    });

    return Response.json({
      success: true,
      accountId: verification.accountId,
      accountLabel: verification.accountLabel,
      recentChargeCount: verification.recentChargeCount,
      lastChargeAt: verification.lastChargeAt,
      channelId: channel.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to connect Stripe";
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
      where: { agentId_type: { agentId, type: STRIPE_CHANNEL_TYPE as never } },
    });

    if (!channel) {
      return Response.json({ connected: false });
    }

    const config = parseStripeConfig(channel.config);
    const verification = await verifyStripeSecretKey(config.secretKey);

    return Response.json({
      connected: true,
      isActive: channel.isActive,
      accountId: verification.accountId,
      accountLabel: verification.accountLabel,
      recentChargeCount: verification.recentChargeCount,
      lastChargeAt: verification.lastChargeAt,
      createdAt: channel.createdAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify Stripe connection";
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
      where: { agentId_type: { agentId, type: STRIPE_CHANNEL_TYPE as never } },
    });

    if (channel) {
      await prisma.agentChannel.delete({ where: { id: channel.id } });
    }

    return Response.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disconnect Stripe";
    return Response.json({ error: message }, { status: 500 });
  }
}
