import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// Alle Memories eines Agents laden (gruppiert nach sessionHash)
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
      select: { id: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const memories = await prisma.agentMemory.findMany({
      where: { agentId: agent.id },
      orderBy: { updatedAt: "desc" },
    });

    // Gruppiert nach sessionHash
    const grouped: Record<string, { sessionHash: string; memories: typeof memories }> = {};
    for (const mem of memories) {
      if (!grouped[mem.sessionHash]) {
        grouped[mem.sessionHash] = { sessionHash: mem.sessionHash, memories: [] };
      }
      grouped[mem.sessionHash].memories.push(mem);
    }

    return Response.json({
      memories,
      grouped: Object.values(grouped),
      total: memories.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Einzelne Memory löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

    const { memoryId } = await request.json();
    if (!memoryId) {
      return Response.json({ error: "memoryId is required" }, { status: 400 });
    }

    // Sicherstellen dass die Memory zum Agent gehört
    const memory = await prisma.agentMemory.findFirst({
      where: { id: memoryId, agentId: agent.id },
    });

    if (!memory) {
      return Response.json({ error: "Memory not found" }, { status: 404 });
    }

    await prisma.agentMemory.delete({ where: { id: memoryId } });

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
