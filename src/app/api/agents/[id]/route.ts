import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { fireWebhookEvent } from "@/lib/webhooks";
import { emitEvent } from "@/lib/events";
import { sanitizeCss } from "@/lib/css-sanitizer";
import {
  applyAgentUpdateToVersionConfig,
  createVersion,
  getCurrentVersionNumber,
  snapshotAgentConfig,
} from "@/lib/agent-versioning";

// Load agent details
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
      include: {
        actions: true,
        knowledgeBases: true,
        _count: { select: { conversations: true } },
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const currentVersion = await getCurrentVersionNumber(params.id, snapshotAgentConfig(agent));

    return Response.json({
      ...agent,
      currentVersion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Update agent
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check ownership — mit Actions für Snapshot
    const existing = await prisma.agent.findFirst({
      where: { id: params.id, userId },
      include: { actions: true },
    });
    if (!existing) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const body = await request.json();
    const sanitizedBody =
      body?.whiteLabel &&
      typeof body.whiteLabel === "object" &&
      typeof (body.whiteLabel as Record<string, unknown>).customCss === "string"
        ? {
            ...body,
            whiteLabel: {
              ...(body.whiteLabel as Record<string, unknown>),
              customCss: sanitizeCss((body.whiteLabel as Record<string, string>).customCss),
            },
          }
        : body;

    const previousConfig = snapshotAgentConfig(existing);
    const nextConfig = applyAgentUpdateToVersionConfig(
      previousConfig,
      sanitizedBody && typeof sanitizedBody === "object"
        ? (sanitizedBody as Record<string, unknown>)
        : {}
    );
    const versionMeta = await createVersion(params.id, userId, previousConfig, nextConfig);

    const agent = await prisma.agent.update({
      where: { id: params.id },
      data: sanitizedBody,
    });

    // Webhook: agent.updated
    waitUntil(
      fireWebhookEvent(userId, "agent.updated", params.id, {
        agentName: agent.name,
        status: agent.status,
        changedFields: Object.keys(sanitizedBody),
      }).catch((err) => {
        console.error("Agent updated webhook dispatch failed:", err);
      })
    );
    waitUntil(
      emitEvent("agent.updated", userId, params.id, {
        agentName: agent.name,
        status: agent.status,
        changedFields: Object.keys(sanitizedBody),
      })
    );

    return Response.json({
      ...agent,
      currentVersion: versionMeta.currentVersion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Delete agent
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    await prisma.agent.delete({ where: { id: params.id } });
    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
