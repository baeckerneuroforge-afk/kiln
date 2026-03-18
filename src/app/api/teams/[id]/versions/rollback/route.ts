import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { canEditTeam } from "@/lib/team-permissions";
import { rollbackWorkflowToVersion } from "@/lib/workflow-versioning";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await canEditTeam(params.id, userId))) {
      return Response.json(
        { error: "Team not found or insufficient permissions" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const versionId = body?.versionId;

    if (typeof versionId !== "string" || !versionId.trim()) {
      return Response.json({ error: "versionId is required" }, { status: 400 });
    }

    const result = await rollbackWorkflowToVersion(params.id, versionId, userId);

    return Response.json({
      success: true,
      restoredVersion: result.restoredVersion,
      currentVersion: result.currentVersion,
      changelog: result.changelog,
    });
  } catch (err) {
    console.error("POST /api/teams/[id]/versions/rollback error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
