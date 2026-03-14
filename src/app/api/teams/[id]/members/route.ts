import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// List members with agent details and hierarchy
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

    const members = await prisma.agentTeamMember.findMany({
      where: { teamId: params.id },
      include: {
        agent: { select: { id: true, name: true, slug: true, description: true } },
        reportsTo: {
          include: {
            agent: { select: { id: true, name: true } },
          },
        },
        subordinates: {
          include: {
            agent: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { level: "asc" },
    });

    return Response.json(members);
  } catch (err) {
    console.error("GET /api/teams/[id]/members error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Add member to team
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
    const { agentId, role, responsibilities, reportsToMemberId, level } = body;

    if (!agentId || !role) {
      return Response.json(
        { error: "agentId and role are required." },
        { status: 400 }
      );
    }

    // Validate that the agent belongs to the user
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    // Validate max 1 HEAD per team
    if (role === "HEAD") {
      const existingHead = await prisma.agentTeamMember.findFirst({
        where: { teamId: params.id, role: "HEAD" },
      });
      if (existingHead) {
        return Response.json(
          { error: "Team already has a HEAD member. Only one HEAD is allowed per team." },
          { status: 400 }
        );
      }
    }

    // Validate reportsToMemberId if provided
    if (reportsToMemberId) {
      const reportsToMember = await prisma.agentTeamMember.findFirst({
        where: { id: reportsToMemberId, teamId: params.id },
      });
      if (!reportsToMember) {
        return Response.json(
          { error: "reportsToMemberId does not reference a valid team member." },
          { status: 400 }
        );
      }
    }

    const member = await prisma.agentTeamMember.create({
      data: {
        teamId: params.id,
        agentId,
        role,
        level: level ?? 0,
        responsibilities: responsibilities || null,
        reportsToMemberId: reportsToMemberId || null,
      },
      include: {
        agent: { select: { id: true, name: true, slug: true } },
      },
    });

    return Response.json(member, { status: 201 });
  } catch (err) {
    console.error("POST /api/teams/[id]/members error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Remove member from team
export async function DELETE(
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
    const { memberId } = body;

    if (!memberId) {
      return Response.json(
        { error: "memberId is required." },
        { status: 400 }
      );
    }

    const member = await prisma.agentTeamMember.findFirst({
      where: { id: memberId, teamId: params.id },
    });
    if (!member) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }

    await prisma.agentTeamMember.delete({ where: { id: memberId } });
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/teams/[id]/members error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
