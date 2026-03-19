import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/agents/[id]/research — list research entries
 * ?status=DRAFT|APPROVED|REJECTED|CONFLICT (optional filter)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      enableAgenticRag: true,
      agenticRagAutoApprove: true,
      agenticRagMinConfidence: true,
    },
  });

  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const statusFilter = request.nextUrl.searchParams.get("status");

  const entries = await prisma.agentResearchEntry.findMany({
    where: {
      agentId: params.id,
      ...(statusFilter
        ? { status: statusFilter as "DRAFT" | "APPROVED" | "REJECTED" | "CONFLICT" }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Für CONFLICT-Entries: zugehörige KB-Inhalte laden
  const enrichedEntries = await Promise.all(
    entries.map(async (entry) => {
      if (entry.status === "CONFLICT" && entry.conflictsWith) {
        const kb = await prisma.knowledgeBase.findUnique({
          where: { id: entry.conflictsWith },
          select: { content: true },
        });
        return { ...entry, conflictingContent: kb?.content || null };
      }
      return { ...entry, conflictingContent: null };
    })
  );

  const [draftCount, conflictCount] = await Promise.all([
    prisma.agentResearchEntry.count({
      where: { agentId: params.id, status: "DRAFT" },
    }),
    prisma.agentResearchEntry.count({
      where: { agentId: params.id, status: "CONFLICT" },
    }),
  ]);

  return Response.json({
    entries: enrichedEntries,
    draftCount,
    conflictCount,
    agenticRagEnabled: agent.enableAgenticRag,
    autoApproveEnabled: agent.agenticRagAutoApprove,
    minConfidence: agent.agenticRagMinConfidence,
  });
}
