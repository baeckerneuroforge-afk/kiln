import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getTeamTemplate, TEAM_TEMPLATES } from "@/lib/team-templates";
import crypto from "crypto";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

// GET: List available templates
export async function GET() {
  return Response.json(
    TEAM_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      goal: t.goal,
      description: t.description,
      roleCount: t.roles.length,
      roles: t.roles.map((r) => ({ name: r.name, role: r.role })),
    }))
  );
}

// POST: Provision a team from a template (creates team + agents + members)
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { templateId } = await request.json();
    const template = getTeamTemplate(templateId);
    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    // Ensure user exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@clerk.temp` },
    });

    // Create the team
    const team = await prisma.agentTeam.create({
      data: {
        userId,
        name: template.name,
        goal: template.goal,
        description: template.description,
      },
    });

    // Create agents and members for each role
    const memberMap = new Map<string, string>(); // role name → member ID

    // First pass: create all agents and members (without reportsTo)
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

      const levelMap = { HEAD: 0, COORDINATOR: 1, EXECUTOR: 2, REPORTER: 2 };
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

    // Fetch the complete team
    const fullTeam = await prisma.agentTeam.findUnique({
      where: { id: team.id },
      include: {
        members: {
          include: { agent: { select: { id: true, name: true, slug: true, status: true } } },
        },
        _count: { select: { tasks: true } },
      },
    });

    return Response.json(fullTeam, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
