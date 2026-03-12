import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

// Einzelnen Agent klonen
async function cloneAgent(
  sourceAgentId: string,
  userId: string,
  newName: string,
  options: { includeKB: boolean; includeActions: boolean; includeTools: boolean }
): Promise<string> {
  const source = await prisma.agent.findFirst({
    where: { id: sourceAgentId, userId },
    include: {
      actions: true,
      customTools: true,
      knowledgeBases: true,
    },
  });

  if (!source) throw new Error("Agent not found");

  // Neuen Agent erstellen
  const clone = await prisma.agent.create({
    data: {
      userId,
      name: newName,
      slug: generateSlug(newName),
      description: source.description,
      systemPrompt: source.systemPrompt,
      personality: source.personality ?? undefined,
      welcomeMessage: source.welcomeMessage,
      suggestedQuestions: source.suggestedQuestions,
      llmModel: source.llmModel,
      status: "DRAFT",
      whiteLabel: source.whiteLabel ?? undefined,
      showPoweredBy: source.showPoweredBy,
      avgDealValue: source.avgDealValue,
      memoryEnabled: source.memoryEnabled,
      imageAnalysisEnabled: source.imageAnalysisEnabled,
      clonedFromId: source.id,
      clonedFromName: source.name,
    },
  });

  // Actions klonen
  if (options.includeActions && source.actions.length > 0) {
    await prisma.agentAction.createMany({
      data: source.actions.map((a) => ({
        agentId: clone.id,
        type: a.type,
        enabled: a.enabled,
        config: a.config ?? undefined,
      })),
    });
  }

  // Custom Tools klonen
  if (options.includeTools && source.customTools.length > 0) {
    await prisma.agentCustomTool.createMany({
      data: source.customTools.map((t) => ({
        agentId: clone.id,
        name: t.name,
        description: t.description,
        method: t.method,
        url: t.url,
        headers: t.headers ?? undefined,
        bodyTemplate: t.bodyTemplate,
        responseMapping: t.responseMapping,
        enabled: t.enabled,
      })),
    });
  }

  // Knowledge Base Einträge klonen
  if (options.includeKB && source.knowledgeBases.length > 0) {
    await prisma.knowledgeBase.createMany({
      data: source.knowledgeBases.map((kb) => ({
        agentId: clone.id,
        type: kb.type,
        sourceName: kb.sourceName,
        content: kb.content,
        chunkCount: kb.chunkCount,
        embeddingStatus: kb.embeddingStatus,
      })),
    });
  }

  return clone.id;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Plan prüfen — nur Pro/Agency/Admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user || user.plan === "FREE") {
      return Response.json(
        { error: "Agent cloning requires a Pro or Agency plan." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, count, includeKB = true, includeActions = true, includeTools = true } = body;

    if (!name || typeof name !== "string") {
      return Response.json({ error: "Name is required." }, { status: 400 });
    }

    const copies = Math.min(10, Math.max(1, Number(count) || 1));

    // Bulk Clone nur für Agency/Admin
    if (copies > 1 && user.plan !== "AGENCY") {
      return Response.json(
        { error: "Bulk cloning requires an Agency plan." },
        { status: 403 }
      );
    }

    const options = { includeKB, includeActions, includeTools };
    const clonedIds: string[] = [];

    if (copies === 1) {
      const id = await cloneAgent(params.id, userId, name, options);
      clonedIds.push(id);
    } else {
      for (let i = 1; i <= copies; i++) {
        const id = await cloneAgent(params.id, userId, `${name} (${i})`, options);
        clonedIds.push(id);
      }
    }

    return Response.json({ clonedIds, count: clonedIds.length }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
