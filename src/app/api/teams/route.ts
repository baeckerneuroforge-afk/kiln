import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { deployTeamTemplate } from "@/lib/team-templates";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";
import { describeTeamSchedule, normalizeTeamScheduleConfig } from "@/lib/team-schedule";

// List all teams for the user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const teams = await prisma.agentTeam.findMany({
      where: { userId },
      include: {
        members: {
          include: {
            agent: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(
      teams.map((team) => {
        const schedule = normalizeTeamScheduleConfig(
          team.config && typeof team.config === "object"
            ? (team.config as Record<string, unknown>).schedule
            : null
        );

        return {
          ...team,
          scheduleSummary: describeTeamSchedule(schedule),
        };
      })
    );
  } catch (err) {
    console.error("GET /api/teams error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Create a new team (optionally from a template)
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, goal, template: templateKey } = body;

    if (!name && !templateKey) {
      return Response.json(
        { error: "Name is required." },
        { status: 400 }
      );
    }

    // Ensure user exists
    const userEmail = await getUserEmailOrPlaceholder(userId);
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: userEmail },
    });

    if (templateKey) {
      const result = await deployTeamTemplate(userId, templateKey, {
        teamName: name,
      });

      const fullTeam = await prisma.agentTeam.findUnique({
        where: { id: result.teamId },
        include: {
          members: {
            include: { agent: { select: { id: true, name: true, slug: true } } },
          },
          _count: { select: { tasks: true } },
        },
      });

      return Response.json(fullTeam, { status: 201 });
    }

    const team = await prisma.agentTeam.create({
      data: {
        userId,
        name,
        description: description || null,
        goal: goal || null,
      },
    });

    // Return full team with members
    const fullTeam = await prisma.agentTeam.findUnique({
      where: { id: team.id },
      include: {
        members: {
          include: { agent: { select: { id: true, name: true, slug: true } } },
        },
        _count: { select: { tasks: true } },
      },
    });

    return Response.json(fullTeam, { status: 201 });
  } catch (err) {
    console.error("POST /api/teams error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
