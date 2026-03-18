import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getTeamPermission, hasPermission } from "@/lib/team-permissions";

// PATCH — change role
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; permId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = await getTeamPermission(params.id, userId);
    if (!hasPermission(userRole, "OWNER")) {
      return Response.json({ error: "Only the owner can change roles." }, { status: 403 });
    }

    const body = await request.json();
    const { role } = body;

    const validRoles = ["EDITOR", "VIEWER", "APPROVER"];
    if (!validRoles.includes(role)) {
      return Response.json({ error: "Invalid role." }, { status: 400 });
    }

    const permission = await prisma.teamPermission.findFirst({
      where: { id: params.permId, teamId: params.id },
    });

    if (!permission) {
      return Response.json({ error: "Permission not found." }, { status: 404 });
    }

    const updated = await prisma.teamPermission.update({
      where: { id: params.permId },
      data: { role },
    });

    return Response.json(updated);
  } catch (err) {
    console.error("PATCH /api/teams/[id]/permissions/[permId] error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE — revoke access
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; permId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = await getTeamPermission(params.id, userId);
    if (!hasPermission(userRole, "OWNER")) {
      return Response.json({ error: "Only the owner can revoke access." }, { status: 403 });
    }

    const permission = await prisma.teamPermission.findFirst({
      where: { id: params.permId, teamId: params.id },
    });

    if (!permission) {
      return Response.json({ error: "Permission not found." }, { status: 404 });
    }

    const updated = await prisma.teamPermission.update({
      where: { id: params.permId },
      data: { status: "REVOKED" },
    });

    return Response.json(updated);
  } catch (err) {
    console.error("DELETE /api/teams/[id]/permissions/[permId] error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
