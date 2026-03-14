import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getTeamTemplate } from "@/lib/team-templates";
import crypto from "crypto";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

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

    return Response.json(teams);
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

    if (!name) {
      return Response.json(
        { error: "Name is required." },
        { status: 400 }
      );
    }

    // Ensure user exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@clerk.temp` },
    });

    // If a template key was provided, use the template to provision agents
    const template = templateKey ? getTeamTemplate(templateKey.toUpperCase()) : null;

    const team = await prisma.agentTeam.create({
      data: {
        userId,
        name,
        description: description || template?.description || null,
        goal: goal || template?.goal || null,
      },
    });

    // If template, create agents and members
    if (template) {
      const memberMap = new Map<string, string>();

      // First pass: create agents and members
      for (const role of template.roles) {
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

        const levelMap = { HEAD: 0, COORDINATOR: 1, EXECUTOR: 2, REPORTER: 2 } as const;
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

      // Second pass: set reportsTo relationships
      for (const role of template.roles) {
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
    }

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
