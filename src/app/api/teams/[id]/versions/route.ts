import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canAccessTeam, canEditTeam } from "@/lib/team-permissions";
import {
  snapshotWorkflowConfig,
  getWorkflowVersionHistory,
  getCurrentWorkflowVersionNumber,
  createManualWorkflowSnapshot,
} from "@/lib/workflow-versioning";

export async function GET(
  _request: NextRequest,
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

    const team = await prisma.agentTeam.findUnique({
      where: { id: params.id },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const currentConfig = snapshotWorkflowConfig(team);
    const [versions, currentVersion] = await Promise.all([
      getWorkflowVersionHistory(params.id),
      getCurrentWorkflowVersionNumber(params.id, currentConfig),
    ]);

    return Response.json({ currentVersion, versions });
  } catch (err) {
    console.error("GET /api/teams/[id]/versions error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

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
      return Response.json({ error: "Team not found or insufficient permissions" }, { status: 404 });
    }

    const team = await prisma.agentTeam.findUnique({
      where: { id: params.id },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const changelog =
      typeof body?.changelog === "string" && body.changelog.trim()
        ? body.changelog.trim()
        : "Manual snapshot";
    const note =
      typeof body?.note === "string" && body.note.trim()
        ? body.note.trim()
        : undefined;

    const currentConfig = snapshotWorkflowConfig(team);
    const version = await createManualWorkflowSnapshot(
      params.id,
      userId,
      currentConfig,
      changelog,
      note
    );

    return Response.json(
      {
        success: true,
        currentVersion: version.currentVersion,
        version: version.version,
        changelog: version.changelog,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/teams/[id]/versions error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
