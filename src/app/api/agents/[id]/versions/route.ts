import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET — Alle Versionen eines Agents laden
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const versions = await prisma.agentVersion.findMany({
    where: { agentId: params.id },
    orderBy: { versionNumber: "desc" },
    take: 50,
  });

  return Response.json(versions);
}

// PATCH — Version annotieren (Note hinzufügen) oder Restore ausführen
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    include: { actions: true },
  });
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await request.json();
  const { versionId, action, note } = body;

  if (!versionId) {
    return Response.json({ error: "versionId is required." }, { status: 400 });
  }

  const version = await prisma.agentVersion.findFirst({
    where: { id: versionId, agentId: params.id },
  });
  if (!version) {
    return Response.json({ error: "Version not found" }, { status: 404 });
  }

  // Note hinzufügen
  if (action === "annotate") {
    const updated = await prisma.agentVersion.update({
      where: { id: versionId },
      data: { note: note || null },
    });
    return Response.json(updated);
  }

  // Restore: Snapshot in den Agent zurückschreiben
  if (action === "restore") {
    const snapshot = version.configSnapshot as Record<string, unknown>;

    // Erst: aktuellen State als neue Version speichern (Sicherheits-Snapshot)
    const lastVersion = await prisma.agentVersion.findFirst({
      where: { agentId: params.id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextVersion = (lastVersion?.versionNumber || 0) + 1;

    const currentSnapshot = {
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      personality: agent.personality,
      welcomeMessage: agent.welcomeMessage,
      suggestedQuestions: agent.suggestedQuestions,
      llmModel: agent.llmModel,
      status: agent.status,
      whiteLabel: agent.whiteLabel,
      showPoweredBy: agent.showPoweredBy,
      memoryEnabled: agent.memoryEnabled,
      imageAnalysisEnabled: agent.imageAnalysisEnabled,
      actions: agent.actions.map((a) => ({
        type: a.type,
        enabled: a.enabled,
        config: a.config,
      })),
    };

    await prisma.agentVersion.create({
      data: {
        agentId: params.id,
        versionNumber: nextVersion,
        configSnapshot: currentSnapshot,
        note: `Auto-saved before restoring to v${version.versionNumber}`,
      },
    });

    // Agent-Felder aus Snapshot überschreiben
    await prisma.agent.update({
      where: { id: params.id },
      data: {
        name: (snapshot.name as string) || agent.name,
        systemPrompt: (snapshot.systemPrompt as string) || agent.systemPrompt,
        personality: snapshot.personality !== undefined ? snapshot.personality as object : undefined,
        welcomeMessage: snapshot.welcomeMessage !== undefined ? snapshot.welcomeMessage as string : undefined,
        suggestedQuestions: Array.isArray(snapshot.suggestedQuestions)
          ? (snapshot.suggestedQuestions as string[])
          : undefined,
        llmModel: (snapshot.llmModel as string) || undefined,
        status: (snapshot.status as "DRAFT" | "LIVE" | "PAUSED") || undefined,
        whiteLabel: snapshot.whiteLabel !== undefined ? snapshot.whiteLabel as object : undefined,
        showPoweredBy: typeof snapshot.showPoweredBy === "boolean" ? snapshot.showPoweredBy : undefined,
        memoryEnabled: typeof snapshot.memoryEnabled === "boolean" ? snapshot.memoryEnabled : undefined,
        imageAnalysisEnabled: typeof snapshot.imageAnalysisEnabled === "boolean" ? snapshot.imageAnalysisEnabled : undefined,
      },
    });

    // Actions aus Snapshot wiederherstellen
    const snapshotActions = snapshot.actions as { type: string; enabled: boolean; config: unknown }[] | undefined;
    if (Array.isArray(snapshotActions)) {
      // Bestehende Actions löschen und neu erstellen
      await prisma.agentAction.deleteMany({ where: { agentId: params.id } });
      if (snapshotActions.length > 0) {
        await prisma.agentAction.createMany({
          data: snapshotActions.map((a) => ({
            agentId: params.id,
            type: a.type as "BOOK_APPOINTMENT" | "COLLECT_EMAIL" | "SEND_EMAIL" | "SCORE_LEAD" | "NOTIFY_OWNER" | "FIRE_WEBHOOK" | "HANDOFF_HUMAN" | "CUSTOM_CODE",
            enabled: a.enabled,
            config: a.config as object ?? undefined,
          })),
        });
      }
    }

    return Response.json({ success: true, restoredTo: version.versionNumber });
  }

  return Response.json({ error: "Invalid action. Use 'annotate' or 'restore'." }, { status: 400 });
}
