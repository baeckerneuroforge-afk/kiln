import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";

// Delete team knowledge entry
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; kbId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const kb = await prisma.knowledgeBase.findFirst({
      where: { id: params.kbId, teamId: params.id },
    });
    if (!kb) {
      return Response.json({ error: "Knowledge entry not found" }, { status: 404 });
    }

    // Delete chunks from Supabase
    const supabase = getSupabaseAdmin();
    await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("knowledge_base_id", params.kbId)
      .then(() => {});

    // Delete KB entry
    await prisma.knowledgeBase.delete({ where: { id: params.kbId } });

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
