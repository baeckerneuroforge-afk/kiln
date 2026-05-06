import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canAccessTeam, canEditTeam } from "@/lib/team-permissions";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessTeam(params.id, userId))) {
    return Response.json({ error: "Team not found" }, { status: 404 });
  }

  const items = await prisma.workflowDeadLetter.findMany({
    where: { agentTeamId: params.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return Response.json({ items });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditTeam(params.id, userId))) {
    return Response.json({ error: "Team not found or insufficient permissions" }, { status: 404 });
  }

  const body = await request.json();
  const itemId = String(body.itemId || "");
  const action = String(body.action || "");

  if (!itemId || !["retry", "discard"].includes(action)) {
    return Response.json({ error: "itemId and action=retry|discard are required." }, { status: 400 });
  }

  const existing = await prisma.workflowDeadLetter.findFirst({
    where: { id: itemId, agentTeamId: params.id },
  });
  if (!existing) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }

  const item = await prisma.workflowDeadLetter.update({
    where: { id: existing.id },
    data: action === "retry"
      ? {
          status: "RETRIED",
          retriedAt: new Date(),
          attempts: { increment: 1 },
        }
      : {
          status: "DISCARDED",
          discardedAt: new Date(),
      },
  });

  return Response.json({ item });
}
