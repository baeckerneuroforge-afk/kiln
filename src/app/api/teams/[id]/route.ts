import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getTeamSchedulePreview,
  normalizeTeamScheduleConfig,
} from "@/lib/team-schedule";

// Get single team with members, tasks, and hierarchy
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
      include: {
        members: {
          include: {
            agent: { select: { id: true, name: true, slug: true, description: true, llmModel: true, modelProvider: true, agentMode: true, systemPrompt: true } },
            fallbackAgent: { select: { id: true, name: true, slug: true, description: true, llmModel: true, modelProvider: true } },
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
        },
        tasks: {
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { tasks: true, members: true } },
      },
    });

    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    // Resolve parent team name for cloned/forked teams
    let parentTeamName: string | null = null;
    if (team.parentTeamId) {
      const parent = await prisma.agentTeam.findUnique({
        where: { id: team.parentTeamId },
        select: { name: true },
      });
      parentTeamName = parent?.name ?? null;
    }

    return Response.json({
      ...team,
      parentTeamName,
      schedulePreview: getTeamSchedulePreview(
        normalizeTeamScheduleConfig(
          team.config && typeof team.config === "object"
            ? (team.config as Record<string, unknown>).schedule
            : null
        )
      ),
    });
  } catch (err) {
    console.error("GET /api/teams/[id] error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Update team
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, goal, status, config } = body;
    const mergedConfig =
      config !== undefined
        ? {
            ...(existing.config &&
            typeof existing.config === "object" &&
            !Array.isArray(existing.config)
              ? (existing.config as Record<string, unknown>)
              : {}),
            ...(config && typeof config === "object" && !Array.isArray(config)
              ? (config as Record<string, unknown>)
              : {}),
          }
        : undefined;

    const team = await prisma.agentTeam.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(goal !== undefined && { goal }),
        ...(status !== undefined && { status }),
        ...(mergedConfig !== undefined && {
          config: JSON.parse(
            JSON.stringify(mergedConfig)
          ) as Prisma.InputJsonValue,
        }),
      },
    });

    return Response.json({
      ...team,
      schedulePreview: getTeamSchedulePreview(
        normalizeTeamScheduleConfig(
          mergedConfig &&
            typeof mergedConfig === "object" &&
            !Array.isArray(mergedConfig)
            ? (mergedConfig as Record<string, unknown>).schedule
            : team.config &&
                typeof team.config === "object" &&
                !Array.isArray(team.config)
              ? (team.config as Record<string, unknown>).schedule
              : null
        )
      ),
    });
  } catch (err) {
    console.error("PATCH /api/teams/[id] error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Delete team
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    await prisma.agentTeam.delete({ where: { id: params.id } });
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/teams/[id] error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
