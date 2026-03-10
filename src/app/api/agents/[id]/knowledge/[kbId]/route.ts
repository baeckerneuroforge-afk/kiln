import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";

// Knowledge Base Eintrag löschen
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; kbId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // Ownership prüfen
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    const kb = await prisma.knowledgeBase.findFirst({
      where: { id: params.kbId, agentId: params.id },
    });
    if (!kb) {
      return Response.json({ error: "KB-Eintrag nicht gefunden" }, { status: 404 });
    }

    // Chunks aus Supabase pgvector löschen
    try {
      const supabase = getSupabaseAdmin();
      await supabase
        .from("knowledge_chunks")
        .delete()
        .eq("knowledge_base_id", params.kbId);
    } catch {
      // Stille Fehlerbehandlung — Chunks werden ggf. nicht gelöscht
    }

    // KB-Eintrag aus Prisma löschen
    await prisma.knowledgeBase.delete({ where: { id: params.kbId } });

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server-Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}
