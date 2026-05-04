import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// Delete knowledge base entry
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; kbId: string } }
) {
  try {
    let scope;
    try {
      scope = await requireOrgId();
    } catch (err) {
      if (err instanceof OrgContextError) return unauthorized();
      throw err;
    }

    // Check ownership
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, ...orgScopeFilter(scope) },
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
