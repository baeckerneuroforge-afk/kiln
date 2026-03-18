import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/agents/[id]/conversations?visitorId=xxx
// Returns conversations for a specific visitor (matched by visitorId stored in session)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!agent) return Response.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const visitorId = url.searchParams.get("visitorId");

  if (!visitorId) {
    return Response.json({ error: "visitorId required" }, { status: 400 });
  }

  // Lookup visitor memory to get email for cross-device matching
  const visitor = await prisma.visitorMemory.findUnique({
    where: { agentId_visitorId: { agentId: params.id, visitorId } },
    select: { email: true },
  });

  // Find conversations by visitorEmail or by sessionId pattern
  // We search conversations where the visitorEmail matches (most reliable for identified visitors)
  const conversations = await prisma.conversation.findMany({
    where: {
      agentId: params.id,
      ...(visitor?.email
        ? { visitorEmail: visitor.email }
        : { sessionId: { contains: "" } }), // Fallback: all convs (limited below)
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      messages: {
        take: 1,
        orderBy: { createdAt: "asc" },
        where: { role: "USER" },
        select: { content: true },
      },
      _count: { select: { messages: true } },
    },
  });

  return Response.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      messageCount: c._count.messages,
      preview: c.messages[0]?.content?.slice(0, 120) || "",
    })),
  });
}
