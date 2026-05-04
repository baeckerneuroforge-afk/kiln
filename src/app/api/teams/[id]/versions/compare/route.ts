import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { canAccessTeam } from "@/lib/team-permissions";
import {
  getWorkflowVersionConfig,
  computeWorkflowDiff,
} from "@/lib/workflow-versioning";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await canAccessTeam(params.id, userId))) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const aId = url.searchParams.get("a");
    const bId = url.searchParams.get("b");

    if (!aId || !bId) {
      return Response.json(
        { error: "Missing version IDs (a, b query params)" },
        { status: 400 }
      );
    }

    const [versionA, versionB] = await Promise.all([
      getWorkflowVersionConfig(aId),
      getWorkflowVersionConfig(bId),
    ]);

    if (!versionA || !versionB) {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }

    // Verify both belong to this team
    if (versionA.teamId !== params.id || versionB.teamId !== params.id) {
      return Response.json({ error: "Version does not belong to this team" }, { status: 403 });
    }

    const diff = computeWorkflowDiff(versionA.parsedConfig, versionB.parsedConfig);

    return Response.json({
      configA: versionA.parsedConfig,
      configB: versionB.parsedConfig,
      diff,
    });
  } catch (err) {
    console.error("GET /api/teams/[id]/versions/compare error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
