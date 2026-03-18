import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/agents/[id]/visitor-memories — Liste aller Visitor-Memories
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Verify agent ownership
  const agent = await prisma.agent.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });
  if (!agent || agent.userId !== userId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const visitors = await prisma.visitorMemory.findMany({
    where: { agentId: params.id },
    orderBy: { lastVisitAt: "desc" },
    take: 100,
  });

  return Response.json({
    visitors: visitors.map((v) => ({
      id: v.id,
      visitorId: v.visitorId,
      displayName: v.displayName,
      email: v.email,
      memoryContext: v.memoryContext,
      tags: v.tags,
      conversationCount: v.conversationCount,
      firstVisitAt: v.firstVisitAt.toISOString(),
      lastVisitAt: v.lastVisitAt.toISOString(),
    })),
    total: visitors.length,
  });
}

// PATCH /api/agents/[id]/visitor-memories — Notiz oder Tags hinzufügen
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await prisma.agent.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });
  if (!agent || agent.userId !== userId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { visitorMemoryId, note, tags } = body;

  if (!visitorMemoryId) {
    return Response.json({ error: "visitorMemoryId required" }, { status: 400 });
  }

  const visitor = await prisma.visitorMemory.findUnique({
    where: { id: visitorMemoryId },
  });
  if (!visitor || visitor.agentId !== params.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const ctx = (visitor.memoryContext || {}) as Record<string, unknown>;

  // Add manual note to keyFacts
  if (note && typeof note === "string") {
    const existing = (ctx.keyFacts as string[]) || [];
    ctx.keyFacts = [...existing, `[Manual note] ${note}`].slice(0, 20);
  }

  const updateData: Record<string, unknown> = {
    memoryContext: ctx,
  };

  // Merge tags
  if (tags && Array.isArray(tags)) {
    const merged = Array.from(new Set([...visitor.tags, ...tags])).slice(0, 20);
    updateData.tags = merged;
  }

  await prisma.visitorMemory.update({
    where: { id: visitorMemoryId },
    data: updateData,
  });

  return Response.json({ success: true });
}

// DELETE /api/agents/[id]/visitor-memories — Visitor-Memory löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await prisma.agent.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });
  if (!agent || agent.userId !== userId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { visitorMemoryId } = body;

  if (!visitorMemoryId) {
    return Response.json({ error: "visitorMemoryId required" }, { status: 400 });
  }

  await prisma.visitorMemory.deleteMany({
    where: { id: visitorMemoryId, agentId: params.id },
  });

  return Response.json({ success: true });
}
