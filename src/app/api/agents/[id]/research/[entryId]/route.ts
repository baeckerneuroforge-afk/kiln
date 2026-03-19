import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  approveResearchEntry,
  rejectResearchEntry,
  resolveConflict,
} from "@/lib/agentic-rag";

/**
 * POST /api/agents/[id]/research/[entryId]
 * Body: { action: "approve" | "reject" | "resolve_conflict", editedAnswer?, resolution? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; entryId: string } }
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

  const entry = await prisma.agentResearchEntry.findFirst({
    where: { id: params.entryId, agentId: params.id },
  });

  if (!entry) {
    return Response.json({ error: "Research entry not found" }, { status: 404 });
  }

  const body = await request.json();
  const action = body.action as string;

  if (action === "approve") {
    const result = await approveResearchEntry(params.entryId, userId, body.editedAnswer);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ success: true, message: "Research approved and added to Knowledge Base" });
  }

  if (action === "reject") {
    const result = await rejectResearchEntry(params.entryId, userId);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ success: true, message: "Research rejected" });
  }

  if (action === "resolve_conflict") {
    const resolution = body.resolution as "keep_existing" | "replace" | "keep_both";
    if (!resolution || !["keep_existing", "replace", "keep_both"].includes(resolution)) {
      return Response.json({ error: "Invalid resolution" }, { status: 400 });
    }
    const result = await resolveConflict(params.entryId, resolution, userId);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ success: true, message: "Conflict resolved" });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
