import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getClaudeClient } from "@/lib/ai";
import { deductCredits } from "@/lib/credits";

// Execute a team goal — decompose into subtasks via Claude
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
      include: {
        members: {
          include: {
            agent: { select: { id: true, name: true, description: true } },
          },
        },
      },
    });
    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const body = await request.json();
    const { goal } = body;

    if (!goal) {
      return Response.json(
        { error: "Goal is required." },
        { status: 400 }
      );
    }

    // Find the HEAD member
    const headMember = team.members.find((m) => m.role === "HEAD");
    if (!headMember) {
      return Response.json(
        { error: "Team has no HEAD member. Please assign a HEAD before executing." },
        { status: 400 }
      );
    }

    // Build context about team members for Claude
    const memberDescriptions = team.members
      .map(
        (m) =>
          `- ${m.agent.name} (Role: ${m.role}, ID: ${m.id})${m.responsibilities ? ` — ${m.responsibilities}` : ""}${m.agent.description ? ` | ${m.agent.description}` : ""}`
      )
      .join("\n");

    const claude = getClaudeClient();
    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: `You are a team coordinator AI. You decompose a goal into actionable subtasks and assign them to team members.

The team "${team.name}" has the following members:
${memberDescriptions}

Given a goal, break it down into 3-8 concrete subtasks. Each subtask should be assigned to the most appropriate team member based on their role and responsibilities.

Respond with a JSON array of tasks. Each task has:
- "title": Short, actionable task title
- "description": Detailed description of what needs to be done
- "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT"
- "assignedToId": The member ID from the list above (or null if unassigned)

Respond ONLY with a valid JSON array, no other text.`,
      messages: [{ role: "user", content: goal }],
    });

    // Deduct credits for team task decomposition
    waitUntil(
      deductCredits(userId, "claude-sonnet-4-20250514", "TEAM_TASK").catch((err) => {
        console.error("Team execution credit deduction failed:", err);
      })
    );

    // Parse Claude's response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json(
        { error: "Failed to generate subtasks from AI." },
        { status: 500 }
      );
    }

    let subtasks: Array<{
      title: string;
      description?: string;
      priority?: string;
      assignedToId?: string | null;
    }>;

    try {
      // Extract JSON from response (handle potential markdown code blocks)
      const jsonText = textBlock.text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      subtasks = JSON.parse(jsonText);
    } catch {
      return Response.json(
        { error: "Failed to parse AI response into tasks." },
        { status: 500 }
      );
    }

    if (!Array.isArray(subtasks) || subtasks.length === 0) {
      return Response.json(
        { error: "AI returned no valid subtasks." },
        { status: 500 }
      );
    }

    // Collect valid member IDs for validation
    const validMemberIds = new Set(team.members.map((m) => m.id));

    // Create all tasks in the database
    const createdTasks = await prisma.$transaction(
      subtasks.map((task) =>
        prisma.agentTeamTask.create({
          data: {
            teamId: params.id,
            title: task.title,
            description: task.description || null,
            priority: task.priority || "MEDIUM",
            assignedToId:
              task.assignedToId && validMemberIds.has(task.assignedToId)
                ? task.assignedToId
                : null,
            status: "PENDING",
          },
        })
      )
    );

    return Response.json(
      { tasks: createdTasks, count: createdTasks.length },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/teams/[id]/execute error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
