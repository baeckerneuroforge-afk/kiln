import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getTeamPermission } from "@/lib/team-permissions";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { teamId } = body;

    if (!teamId) {
      return Response.json({ error: "teamId is required" }, { status: 400 });
    }

    // Only owner can share a team as template
    const role = await getTeamPermission(teamId, userId);
    if (role !== "OWNER") {
      return Response.json({ error: "Only the team owner can share as template." }, { status: 403 });
    }

    // Load team with members and agents
    const team = await prisma.agentTeam.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                description: true,
                systemPrompt: true,
                mode: true,
                welcomeMessage: true,
                suggestedQuestions: true,
                actions: { where: { enabled: true }, select: { type: true, enabled: true } },
              },
            },
          },
          orderBy: { level: "asc" },
        },
      },
    });

    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    // Get user info for author name
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, companyName: true },
    });

    const authorName = user?.companyName
      || [user?.firstName, user?.lastName].filter(Boolean).join(" ")
      || "KILN User";

    // Build sanitized agent config snapshot (strip sensitive data)
    const workflowAgents = team.members.map((m) => ({
      name: m.agent?.name || (m.role === "APPROVAL_GATE" ? "Approval Gate" : "Agent"),
      mode: m.role === "APPROVAL_GATE" ? "APPROVAL" as const : (m.agent?.mode || "CHAT") as "CHAT" | "TASK",
      role: m.role,
      description: m.agent?.description || m.responsibilities || undefined,
    }));

    // Collect unique actions from all agents
    const allActions: { type: string; enabled: boolean }[] = [];
    const seenActions = new Set<string>();
    for (const member of team.members) {
      if (member.agent?.actions) {
        for (const action of member.agent.actions) {
          if (!seenActions.has(action.type)) {
            seenActions.add(action.type);
            allActions.push({ type: action.type, enabled: action.enabled });
          }
        }
      }
    }

    const agentConfigSnapshot = {
      teamTemplateId: null, // User-submitted template, not a built-in one
      workflowType: "USER_SUBMITTED",
      welcomeMessage: team.members.find((m) => m.role === "HEAD")?.agent?.welcomeMessage || team.description || "",
      suggestedQuestions: team.members.find((m) => m.role === "HEAD")?.agent?.suggestedQuestions || [],
      actions: allActions,
      workflowAgents,
      orchestration: {
        mode: "sequential",
        description: team.goal || team.description || "",
      },
    };

    // Check if template already exists for this team by this author
    const existing = await prisma.marketplaceTemplate.findFirst({
      where: {
        authorId: userId,
        name: team.name,
      },
    });

    if (existing) {
      // Update existing template and reset approval for re-review
      const updated = await prisma.marketplaceTemplate.update({
        where: { id: existing.id },
        data: {
          description: team.description || team.goal || "",
          agentConfigSnapshot,
          category: "Workflow Templates",
          isApproved: false, // Needs re-review after update
        },
      });

      return Response.json({
        id: updated.id,
        status: "updated",
        message: "Template aktualisiert und zur Prüfung eingereicht.",
      });
    }

    // Create new template submission
    const template = await prisma.marketplaceTemplate.create({
      data: {
        authorId: userId,
        authorName,
        name: team.name,
        description: team.description || team.goal || "",
        category: "Workflow Templates",
        price: 0,
        agentConfigSnapshot,
        isApproved: false, // Needs admin review before publishing
      },
    });

    return Response.json({
      id: template.id,
      status: "submitted",
      message: "Template eingereicht! Es wird nach einer Prüfung veröffentlicht.",
    }, { status: 201 });
  } catch (err) {
    console.error("POST /api/marketplace/submit-template error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
