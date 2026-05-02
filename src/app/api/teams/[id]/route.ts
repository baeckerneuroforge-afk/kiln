import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getTeamSchedulePreview,
  normalizeTeamScheduleConfig,
} from "@/lib/team-schedule";
import {
  getTeamPermission,
  canAccessTeam,
  canEditTeam,
} from "@/lib/team-permissions";
import {
  snapshotWorkflowConfig,
  createWorkflowVersion,
} from "@/lib/workflow-versioning";

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

    if (!(await canAccessTeam(params.id, userId))) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const team = await prisma.agentTeam.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: {
            agent: { select: { id: true, name: true, slug: true, description: true, llmModel: true, modelProvider: true, mode: true, systemPrompt: true, inputSchema: true, outputSchema: true } },
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

    const userRole = await getTeamPermission(params.id, userId);

    return Response.json({
      ...team,
      parentTeamName,
      isOwner: team.userId === userId,
      sharedRole: team.userId === userId ? null : userRole,
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

    if (!(await canEditTeam(params.id, userId))) {
      return Response.json({ error: "Team not found or insufficient permissions" }, { status: 404 });
    }

    const existing = await prisma.agentTeam.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    // Snapshot config before update for versioning
    const prevSnapshot = snapshotWorkflowConfig(existing);

    const body = await request.json();
    const { name, description, goal, status, config } = body;
    const saveNote = typeof body.saveNote === "string" ? body.saveNote.trim() : undefined;
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

    // Auto-version: create a version snapshot if workflow content changed
    const newSnapshot = snapshotWorkflowConfig(team);
    let versionInfo: { version: number; currentVersion: number } | undefined;
    try {
      const hasWorkflowChange =
        JSON.stringify(prevSnapshot.nodes) !== JSON.stringify(newSnapshot.nodes) ||
        JSON.stringify(prevSnapshot.edges) !== JSON.stringify(newSnapshot.edges) ||
        JSON.stringify(prevSnapshot.variables) !== JSON.stringify(newSnapshot.variables) ||
        prevSnapshot.name !== newSnapshot.name ||
        prevSnapshot.goal !== newSnapshot.goal;

      if (hasWorkflowChange) {
        const result = await createWorkflowVersion(
          params.id,
          userId,
          prevSnapshot,
          newSnapshot,
          saveNote
        );
        versionInfo = { version: result.version, currentVersion: result.currentVersion };
      }
    } catch (vErr) {
      // Versioning failure should not block the save
      console.error("Auto-versioning failed:", vErr);
    }

    return Response.json({
      ...team,
      ...(versionInfo ? { versionInfo } : {}),
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

    const role = await getTeamPermission(params.id, userId);
    if (role !== "OWNER") {
      return Response.json({ error: "Only the team owner can delete." }, { status: 403 });
    }

    await prisma.agentTeam.delete({ where: { id: params.id } });
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/teams/[id] error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
