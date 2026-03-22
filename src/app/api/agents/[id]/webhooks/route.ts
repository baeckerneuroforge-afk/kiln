import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function generateWebhookPath(agentSlug: string): string {
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${agentSlug}-${suffix}`;
}

// GET: List webhooks + executions for an agent
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const agent = await prisma.agent.findFirst({ where: { id: params.id, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const webhooks = await prisma.agentWebhook.findMany({
      where: { agentId: params.id },
      include: {
        executions: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(webhooks);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Create or update webhook
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const agent = await prisma.agent.findFirst({ where: { id: params.id, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const body = await request.json();
    const { webhookId, authType, authValue, responseMode, httpMethods, isActive } = body;

    if (webhookId) {
      // Update existing
      const webhook = await prisma.agentWebhook.update({
        where: { id: webhookId, agentId: params.id },
        data: {
          ...(authType !== undefined ? { authType } : {}),
          ...(authValue !== undefined ? { authValue } : {}),
          ...(responseMode !== undefined ? { responseMode } : {}),
          ...(httpMethods !== undefined ? { httpMethods } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });
      return Response.json(webhook);
    }

    // Max 5 webhooks per agent
    const count = await prisma.agentWebhook.count({ where: { agentId: params.id } });
    if (count >= 5) {
      return Response.json({ error: "Maximum 5 webhooks per agent" }, { status: 400 });
    }

    const path = generateWebhookPath(agent.slug);
    const secret = crypto.randomBytes(16).toString("hex");

    const webhook = await prisma.agentWebhook.create({
      data: {
        agentId: params.id,
        path,
        secret,
        httpMethods: httpMethods || ["POST"],
        authType: authType || "NONE",
        authValue: authValue || null,
        responseMode: responseMode || "IMMEDIATE",
        isActive: true,
      },
    });

    return Response.json(webhook, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove webhook
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const agent = await prisma.agent.findFirst({ where: { id: params.id, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const { webhookId } = await request.json();
    if (!webhookId) return Response.json({ error: "webhookId required" }, { status: 400 });

    await prisma.agentWebhook.delete({ where: { id: webhookId, agentId: params.id } });
    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
