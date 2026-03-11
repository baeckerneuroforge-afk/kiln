import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";

// Delete knowledge base entry
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; kbId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check ownership
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const kb = await prisma.knowledgeBase.findFirst({
      where: { id: params.kbId, agentId: params.id },
    });
    if (!kb) {
      return Response.json({ error: "Knowledge entry not found" }, { status: 404 });
    }

    // Delete chunks from Supabase pgvector
    try {
      const supabase = getSupabaseAdmin();
      await supabase
        .from("knowledge_chunks")
        .delete()
        .eq("knowledge_base_id", params.kbId);
    } catch {
      // Silent error handling — chunks may not be deleted
    }

    // Delete KB entry from Prisma
    await prisma.knowledgeBase.delete({ where: { id: params.kbId } });

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
