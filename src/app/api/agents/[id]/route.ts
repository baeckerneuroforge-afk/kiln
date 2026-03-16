import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { fireWebhookEvent } from "@/lib/webhooks";
import { emitEvent } from "@/lib/events";

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

    return Response.json(agent);
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

    // Snapshot VOR dem Update erstellen
    const configSnapshot = {
      name: existing.name,
      systemPrompt: existing.systemPrompt,
      personality: existing.personality,
      welcomeMessage: existing.welcomeMessage,
      suggestedQuestions: existing.suggestedQuestions,
      llmModel: existing.llmModel,
      modelProvider: existing.modelProvider,
      status: existing.status,
      whiteLabel: existing.whiteLabel,
      showPoweredBy: existing.showPoweredBy,
      memoryEnabled: existing.memoryEnabled,
      imageAnalysisEnabled: existing.imageAnalysisEnabled,
      showAiDisclaimer: existing.showAiDisclaimer,
      promptBranches: existing.promptBranches,
      actions: existing.actions.map((a) => ({
        type: a.type,
        enabled: a.enabled,
        config: a.config,
      })),
    };

    // Nächste Version-Nummer ermitteln
    const lastVersion = await prisma.agentVersion.findFirst({
      where: { agentId: params.id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextVersion = (lastVersion?.versionNumber || 0) + 1;

    // Version speichern (non-blocking für Performance)
    waitUntil(
      prisma.agentVersion.create({
        data: {
          agentId: params.id,
          versionNumber: nextVersion,
          configSnapshot,
        },
      }).catch((err) => {
        console.error("Agent version snapshot failed:", err);
      })
    );

    const body = await request.json();
    const agent = await prisma.agent.update({
      where: { id: params.id },
      data: body,
    });

    // Webhook: agent.updated
    waitUntil(
      fireWebhookEvent(userId, "agent.updated", params.id, {
        agentName: agent.name,
        status: agent.status,
        changedFields: Object.keys(body),
      }).catch((err) => {
        console.error("Agent updated webhook dispatch failed:", err);
      })
    );
    waitUntil(
      emitEvent("agent.updated", userId, params.id, {
        agentName: agent.name,
        status: agent.status,
        changedFields: Object.keys(body),
      })
    );

    return Response.json(agent);
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
