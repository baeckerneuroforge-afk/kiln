import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { fireWebhookEvent } from "@/lib/webhooks";
import { emitEvent } from "@/lib/events";
import { sanitizeCss } from "@/lib/css-sanitizer";
import { normalizeAgentSchedule } from "@/lib/agent-scheduling";
import { validateSchema } from "@/lib/agents/io-schema-validator";
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

    const rawBody = await request.json();
    // Backward-compat: translate legacy field names from older API consumers
    // before the rest of the pipeline runs.
    const body = {
      ...rawBody,
      ...(rawBody?.agentMode !== undefined && rawBody?.mode === undefined
        ? { mode: rawBody.agentMode }
        : {}),
      ...(rawBody?.agentType !== undefined && rawBody?.visibility === undefined
        ? { visibility: rawBody.agentType }
        : {}),
    };
    delete body.agentMode;
    delete body.agentType;

    // Validate I/O schemas if the client is updating them.
    if (body.inputSchema !== undefined && body.inputSchema !== null) {
      const r = validateSchema(body.inputSchema);
      if (!r.valid) {
        return Response.json(
          { error: "Invalid inputSchema", details: r.errors },
          { status: 400 }
        );
      }
    }
    if (body.outputSchema !== undefined && body.outputSchema !== null) {
      const r = validateSchema(body.outputSchema);
      if (!r.valid) {
        return Response.json(
          { error: "Invalid outputSchema", details: r.errors },
          { status: 400 }
        );
      }
    }

    const whiteLabelRecord =
      body?.whiteLabel && typeof body.whiteLabel === "object"
        ? (body.whiteLabel as Record<string, unknown>)
        : null;

    const sanitizedBody =
      whiteLabelRecord
        ? {
            ...body,
            whiteLabel: {
              ...whiteLabelRecord,
              ...(typeof whiteLabelRecord.customCss === "string"
                ? { customCss: sanitizeCss(whiteLabelRecord.customCss) }
                : {}),
              ...(whiteLabelRecord.schedule !== undefined
                ? { schedule: normalizeAgentSchedule(whiteLabelRecord.schedule) }
                : {}),
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
