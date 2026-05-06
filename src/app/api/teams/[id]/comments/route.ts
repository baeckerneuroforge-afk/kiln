import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canAccessTeam, canEditTeam } from "@/lib/team-permissions";

function normalizePosition(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { x: 0, y: 0 };
  const pos = value as Record<string, unknown>;
  return {
    x: Number(pos.x) || 0,
    y: Number(pos.y) || 0,
    width: Number(pos.width) || 260,
    height: Number(pos.height) || 160,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessTeam(params.id, userId))) {
    return Response.json({ error: "Team not found" }, { status: 404 });
  }

  const comments = await prisma.workflowComment.findMany({
    where: { agentTeamId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ comments });
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
  const content = String(body.content || "").trim();
  if (!content) {
    return Response.json({ error: "Comment content is required." }, { status: 400 });
  }

  const comment = await prisma.workflowComment.create({
    data: {
      agentTeamId: params.id,
      content,
      position: normalizePosition(body.position),
      color: String(body.color || "yellow"),
      authorUserId: userId,
    },
  });

  return Response.json({ comment }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditTeam(params.id, userId))) {
    return Response.json({ error: "Team not found or insufficient permissions" }, { status: 404 });
  }

  const commentId = new URL(request.url).searchParams.get("commentId");
  if (!commentId) {
    return Response.json({ error: "commentId is required." }, { status: 400 });
  }

  await prisma.workflowComment.deleteMany({
    where: { id: commentId, agentTeamId: params.id },
  });
  return Response.json({ success: true });
}
