import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getTeamSchedulePreview,
  normalizeTeamScheduleConfig,
} from "@/lib/team-schedule";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const body = await request.json();
    const schedule = normalizeTeamScheduleConfig(body?.schedule);
    const preview = getTeamSchedulePreview(schedule);

    return Response.json({ preview, schedule });
  } catch (error) {
    console.error("POST /api/teams/[id]/schedule/preview error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
