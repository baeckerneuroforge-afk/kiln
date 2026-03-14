import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// List tasks for a team
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const tasks = await prisma.agentTeamTask.findMany({
      where: { teamId: params.id },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(tasks);
  } catch (err) {
    console.error("GET /api/teams/[id]/tasks error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Create a task
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
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, priority, assignedToId } = body;

    if (!title) {
      return Response.json(
        { error: "Title is required." },
        { status: 400 }
      );
    }

    // Validate assignedToId references a team member if provided
    if (assignedToId) {
      const member = await prisma.agentTeamMember.findFirst({
        where: { id: assignedToId, teamId: params.id },
      });
      if (!member) {
        return Response.json(
          { error: "assignedToId does not reference a valid team member." },
          { status: 400 }
        );
      }
    }

    const task = await prisma.agentTeamTask.create({
      data: {
        teamId: params.id,
        title,
        description: description || null,
        priority: priority || "MEDIUM",
        assignedToId: assignedToId || null,
      },
    });

    return Response.json(task, { status: 201 });
  } catch (err) {
    console.error("POST /api/teams/[id]/tasks error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
