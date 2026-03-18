import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  createManualVersionSnapshot,
  getCurrentVersionNumber,
  getVersionHistory,
  snapshotAgentConfig,
} from "@/lib/agent-versioning";

async function getOwnedAgent(agentId: string, userId: string) {
  return prisma.agent.findFirst({
    where: { id: agentId, userId },
    include: {
      actions: {
        select: {
          type: true,
          enabled: true,
          config: true,
        },
      },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await getOwnedAgent(params.id, userId);
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const currentConfig = snapshotAgentConfig(agent);
  const [versions, currentVersion] = await Promise.all([
    getVersionHistory(params.id),
    getCurrentVersionNumber(params.id, currentConfig),
  ]);

  return Response.json({
    currentVersion,
    versions,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await getOwnedAgent(params.id, userId);
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const changelog =
    typeof body?.changelog === "string" && body.changelog.trim()
      ? body.changelog.trim()
      : "Manual snapshot created";

  const currentConfig = snapshotAgentConfig(agent);
  const version = await createManualVersionSnapshot(params.id, userId, currentConfig, changelog);

  return Response.json(
    {
      success: true,
      currentVersion: version.currentVersion,
      version: version.version,
      changelog: version.changelog,
    },
    { status: 201 }
  );
}
