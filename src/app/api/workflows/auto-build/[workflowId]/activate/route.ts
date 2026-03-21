import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { activateWorkflow } from "@/lib/sandbox/workflow-builder";

/**
 * POST /api/workflows/auto-build/[workflowId]/activate — Draft-Workflow aktivieren
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workflowId } = await params;

  try {
    await activateWorkflow(workflowId, userId);
    return Response.json({ status: "active", workflowId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
