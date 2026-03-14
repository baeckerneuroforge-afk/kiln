import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getClaudeClient } from "@/lib/ai";
import crypto from "crypto";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

interface RoleInput {
  name: string;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER";
  responsibilities: string;
  systemPrompt: string;
  reportsTo?: string;
}

// POST: Generate members for an existing team (from goal or provided roles)
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
      include: { members: true },
    });

    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const body = await request.json();
    let roles: RoleInput[] = body.roles;

    // If no roles provided, generate them via Claude using the team's goal
    if (!roles || roles.length === 0) {
      const goal = body.goal || team.goal;
      if (!goal) {
        return Response.json(
          { error: "Team has no goal. Provide a goal or roles array." },
          { status: 400 }
        );
      }

      const claude = getClaudeClient();
      const response = await claude.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: `You are KILN's Team Architect AI. Given a team name and goal, design the optimal hierarchical agent team structure.

RULES:
- Design 5-8 agents with clear hierarchy
- Exactly 1 HEAD (top-level director/manager)
- 1-3 COORDINATORs (mid-level managers)
- 2-5 EXECUTORs (workers)
- 0-1 REPORTER (optional)
- Every non-HEAD must have "reportsTo" pointing to a manager's name
- Each agent needs a detailed systemPrompt (at least 2 sentences)

Respond ONLY with a valid JSON array. No other text.

JSON format:
{ "name": "Agent Name", "role": "HEAD"|"COORDINATOR"|"EXECUTOR"|"REPORTER", "responsibilities": "...", "systemPrompt": "...", "reportsTo": "Manager Name" }`,
        messages: [
          {
            role: "user",
            content: `Team: "${team.name}"\nGoal: "${goal}"\n\nDesign the optimal team structure.`,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return Response.json(
          { error: "Failed to generate team structure." },
          { status: 500 }
        );
      }

      try {
        const jsonText = textBlock.text
          .replace(/```json?\n?/g, "")
          .replace(/```/g, "")
          .trim();
        roles = JSON.parse(jsonText);
      } catch {
        return Response.json(
          { error: "Failed to parse AI response." },
          { status: 500 }
        );
      }

      if (!Array.isArray(roles) || roles.length === 0) {
        return Response.json(
          { error: "AI returned no valid roles." },
          { status: 500 }
        );
      }
    }

    // Ensure user exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@clerk.temp` },
    });

    // Create agents and members
    const memberMap = new Map<string, string>();
    const levelMap = { HEAD: 0, COORDINATOR: 1, EXECUTOR: 2, REPORTER: 2 } as const;

    for (const role of roles) {
      const agent = await prisma.agent.create({
        data: {
          userId,
          name: role.name,
          slug: generateSlug(role.name),
          systemPrompt: role.systemPrompt,
          description: role.responsibilities,
          status: "DRAFT",
        },
      });

      const member = await prisma.agentTeamMember.create({
        data: {
          teamId: team.id,
          agentId: agent.id,
          role: role.role,
          level: levelMap[role.role],
          responsibilities: role.responsibilities,
        },
      });

      memberMap.set(role.name, member.id);
    }

    // Set reportsTo relationships
    for (const role of roles) {
      if (role.reportsTo) {
        const memberId = memberMap.get(role.name);
        const reportsToId = memberMap.get(role.reportsTo);
        if (memberId && reportsToId) {
          await prisma.agentTeamMember.update({
            where: { id: memberId },
            data: { reportsToMemberId: reportsToId },
          });
        }
      }
    }

    // Return updated team
    const fullTeam = await prisma.agentTeam.findUnique({
      where: { id: team.id },
      include: {
        members: {
          include: {
            agent: { select: { id: true, name: true, slug: true, description: true } },
            reportsTo: { include: { agent: { select: { id: true, name: true } } } },
            subordinates: { include: { agent: { select: { id: true, name: true } } } },
          },
          orderBy: { level: "asc" },
        },
        tasks: { orderBy: { createdAt: "desc" } },
        _count: { select: { tasks: true, members: true } },
      },
    });

    return Response.json(fullTeam, { status: 201 });
  } catch (err) {
    console.error("POST /api/teams/[id]/generate-members error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
