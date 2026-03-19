import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * GET /api/images — Returns all images with metadata, paginated.
 * ?page=1&limit=20&agentId=xxx&type=documents|photos
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(50, Number(params.get("limit")) || 20);
  const agentIdFilter = params.get("agentId") || undefined;
  const typeFilter = params.get("type") || "all";

  // Get user's agents
  const agents = await prisma.agent.findMany({
    where: { userId },
    select: { id: true, name: true },
  });

  const agentIds = agentIdFilter
    ? agents.filter((a) => a.id === agentIdFilter).map((a) => a.id)
    : agents.map((a) => a.id);

  if (agentIds.length === 0) {
    return Response.json({ images: [], hasMore: false, agents: [] });
  }

  const where: Prisma.MessageWhereInput = {
    imageUrl: { not: null },
    role: "USER",
    conversation: {
      agentId: { in: agentIds },
    },
  };

  if (typeFilter === "documents") {
    where.extractedData = { not: Prisma.DbNull };
  } else if (typeFilter === "photos") {
    where.extractedData = { equals: Prisma.DbNull };
  }

  const messages = await prisma.message.findMany({
    where,
    include: {
      conversation: {
        select: {
          id: true,
          agentId: true,
          agent: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const results = messages.slice(0, limit);

  const images = results.map((msg) => ({
    id: msg.id,
    imageUrl: msg.imageUrl,
    content: msg.content?.slice(0, 200) || "",
    extractedData: msg.extractedData as {
      documentType: string;
      fields: Record<string, string | number | null>;
    } | null,
    agentName: msg.conversation.agent.name,
    agentId: msg.conversation.agentId,
    conversationId: msg.conversation.id,
    createdAt: msg.createdAt.toISOString(),
  }));

  return Response.json({ images, hasMore, agents });
}
