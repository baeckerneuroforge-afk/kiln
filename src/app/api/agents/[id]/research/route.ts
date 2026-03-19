import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/agents/[id]/research — list research entries
 * ?status=DRAFT|APPROVED|REJECTED (optional filter)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify agent ownership
  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    select: { id: true, name: true, enableAgenticRag: true },
  });

  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const statusFilter = request.nextUrl.searchParams.get("status");

  const entries = await prisma.agentResearchEntry.findMany({
    where: {
      agentId: params.id,
      ...(statusFilter ? { status: statusFilter as "DRAFT" | "APPROVED" | "REJECTED" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const draftCount = await prisma.agentResearchEntry.count({
    where: { agentId: params.id, status: "DRAFT" },
  });

  return Response.json({ entries, draftCount, agenticRagEnabled: agent.enableAgenticRag });
}
