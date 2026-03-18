import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getTeamPermission, hasPermission, generateInviteToken } from "@/lib/team-permissions";

// GET — list team permissions/members
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getTeamPermission(params.id, userId);
    if (!role) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const permissions = await prisma.teamPermission.findMany({
      where: { teamId: params.id },
      orderBy: { invitedAt: "desc" },
    });

    // Also include the owner
    const team = await prisma.agentTeam.findUnique({
      where: { id: params.id },
      select: { userId: true, user: { select: { email: true, firstName: true, lastName: true } } },
    });

    return Response.json({
      owner: team ? { userId: team.userId, email: team.user.email, name: [team.user.firstName, team.user.lastName].filter(Boolean).join(" ") || null } : null,
      permissions,
    });
  } catch (err) {
    console.error("GET /api/teams/[id]/permissions error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST — invite user by email
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getTeamPermission(params.id, userId);
    if (!hasPermission(role, "OWNER")) {
      return Response.json({ error: "Only the team owner can invite members." }, { status: 403 });
    }

    const body = await request.json();
    const { email, role: inviteRole } = body;

    if (!email || typeof email !== "string") {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    const validRoles = ["EDITOR", "VIEWER", "APPROVER"];
    if (!validRoles.includes(inviteRole)) {
      return Response.json({ error: "Invalid role. Must be EDITOR, VIEWER, or APPROVER." }, { status: 400 });
    }

    // Check if already invited
    const existing = await prisma.teamPermission.findUnique({
      where: { teamId_email: { teamId: params.id, email: email.toLowerCase().trim() } },
    });

    if (existing && existing.status !== "REVOKED") {
      return Response.json({ error: "This email has already been invited." }, { status: 409 });
    }

    const token = generateInviteToken();

    const permission = existing
      ? await prisma.teamPermission.update({
          where: { id: existing.id },
          data: {
            role: inviteRole,
            status: "PENDING",
            inviteToken: token,
            invitedAt: new Date(),
            invitedBy: userId,
            acceptedAt: null,
            userId: null,
          },
        })
      : await prisma.teamPermission.create({
          data: {
            teamId: params.id,
            email: email.toLowerCase().trim(),
            role: inviteRole,
            inviteToken: token,
            invitedBy: userId,
          },
        });

    // Send invitation email
    const team = await prisma.agentTeam.findUnique({
      where: { id: params.id },
      select: { name: true },
    });

    const { sendTeamInviteEmail } = await import("@/lib/email-notifications");
    await sendTeamInviteEmail(
      email.toLowerCase().trim(),
      team?.name || "Team",
      inviteRole,
      token
    );

    return Response.json(permission, { status: 201 });
  } catch (err) {
    console.error("POST /api/teams/[id]/permissions error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
