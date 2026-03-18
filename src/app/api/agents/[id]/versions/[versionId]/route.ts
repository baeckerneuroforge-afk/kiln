import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { rollbackToVersion } from "@/lib/agent-versioning";

export async function PUT(
  _request: NextRequest,
  { params }: { params: { id: string; versionId: string } }
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

  try {
    const result = await rollbackToVersion(params.id, params.versionId, userId);
    return Response.json({
      success: true,
      restoredTo: result.restoredVersion,
      currentVersion: result.currentVersion,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rollback failed";
    const status = message === "Version not found" ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
