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
        fallbackAgent: {
          select: { id: true, name: true, slug: true, description: true },
        },
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
    const {
      agentId,
      role,
      name,
      responsibilities,
      reportsToMemberId,
      level,
      outputSchema,
      enabledActions,
      config,
      executionMode,
      fallbackAgentId,
      fallbackModel,
      fallbackEnabled,
      maxRetries,
    } = body;
    const levelMap = {
      HEAD: 0,
      COORDINATOR: 1,
      APPROVAL_GATE: 2,
      EXECUTOR: 2,
      REPORTER: 2,
    } as const;

    if (!role) {
      return Response.json(
        { error: "role is required." },
        { status: 400 }
      );
    }

    let agent: { id: string; name: string } | null = null;
    if (role !== "APPROVAL_GATE") {
      if (!agentId) {
        return Response.json(
          { error: "agentId is required for non-approval team members." },
          { status: 400 }
        );
      }

      agent = await prisma.agent.findFirst({
        where: { id: agentId, userId },
        select: { id: true, name: true },
      });
      if (!agent) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
      }
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
        ...(role !== "APPROVAL_GATE" ? { agentId } : {}),
        role,
        level: level ?? levelMap[role as keyof typeof levelMap] ?? 0,
        responsibilities: responsibilities || null,
        reportsToMemberId: reportsToMemberId || null,
        outputSchema: outputSchema || undefined,
        enabledActions: enabledActions || [],
        executionMode: executionMode || "sequential",
        fallbackAgentId: fallbackAgentId || null,
        fallbackModel: fallbackModel || null,
        fallbackEnabled:
          typeof fallbackEnabled === "boolean" ? fallbackEnabled : true,
        maxRetries:
          typeof maxRetries === "number" && maxRetries >= 0 ? maxRetries : 2,
        config:
          role === "APPROVAL_GATE"
            ? {
                ...(typeof name === "string" && name.trim()
                  ? { label: name.trim() }
                  : {}),
                ...(config && typeof config === "object" ? config : {}),
              }
            : undefined,
      },
      include: {
        agent: { select: { id: true, name: true, slug: true } },
        fallbackAgent: { select: { id: true, name: true, slug: true } },
      },
    });

    return Response.json(member, { status: 201 });
  } catch (err) {
    console.error("POST /api/teams/[id]/members error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Update member (role, responsibilities, reportsToMemberId)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate team ownership
    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      memberId,
      role,
      responsibilities,
      reportsToMemberId,
      outputSchema,
      enabledActions,
      config,
      feedbackLoop,
      executionMode,
      fallbackAgentId,
      fallbackModel,
      fallbackEnabled,
      maxRetries,
    } = body;
    const levelMap = {
      HEAD: 0,
      COORDINATOR: 1,
      APPROVAL_GATE: 2,
      EXECUTOR: 2,
      REPORTER: 2,
    } as const;

    if (!memberId) {
      return Response.json({ error: "memberId is required." }, { status: 400 });
    }

    // Validate member belongs to this team
    const member = await prisma.agentTeamMember.findFirst({
      where: { id: memberId, teamId: params.id },
    });
    if (!member) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }

    // If changing role to HEAD, ensure no other HEAD exists
    if (role && role === "HEAD" && member.role !== "HEAD") {
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

    // If reportsToMemberId provided, validate it
    if (reportsToMemberId !== undefined && reportsToMemberId !== null) {
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

    // Build update data — only include fields explicitly provided
    const updateData: Record<string, unknown> = {};
    if (role !== undefined) updateData.role = role;
    if (responsibilities !== undefined) updateData.responsibilities = responsibilities || null;
    if (reportsToMemberId !== undefined) updateData.reportsToMemberId = reportsToMemberId || null;
    if (outputSchema !== undefined) updateData.outputSchema = outputSchema;
    if (enabledActions !== undefined) updateData.enabledActions = enabledActions;
    if (config !== undefined) updateData.config = config;
    if (feedbackLoop !== undefined) updateData.feedbackLoop = feedbackLoop;
    if (executionMode !== undefined) updateData.executionMode = executionMode;
    if (fallbackAgentId !== undefined) updateData.fallbackAgentId = fallbackAgentId || null;
    if (fallbackModel !== undefined) updateData.fallbackModel = fallbackModel || null;
    if (fallbackEnabled !== undefined) updateData.fallbackEnabled = fallbackEnabled;
    if (maxRetries !== undefined) updateData.maxRetries = Math.max(0, Number(maxRetries) || 0);
    if (role !== undefined && role in levelMap) {
      updateData.level = levelMap[role as keyof typeof levelMap];
    }

    const updated = await prisma.agentTeamMember.update({
      where: { id: memberId },
      data: updateData,
      include: {
        agent: { select: { id: true, name: true, slug: true } },
        fallbackAgent: { select: { id: true, name: true, slug: true } },
        reportsTo: {
          include: { agent: { select: { id: true, name: true } } },
        },
      },
    });

    return Response.json(updated);
  } catch (err) {
    console.error("PATCH /api/teams/[id]/members error:", err);
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
