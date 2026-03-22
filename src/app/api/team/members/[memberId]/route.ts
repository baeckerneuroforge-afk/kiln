import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { TeamManager } from "@/lib/rbac/team-manager";
import { RBACManager } from "@/lib/rbac/rbac-manager";
import type { RBACRole } from "@/lib/rbac/rbac-manager";

// PUT /api/team/members/[memberId] — Rolle ändern
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const hasPermission = await RBACManager.checkPermission(userId, "team_members", "edit", userId);
    if (!hasPermission) {
      return Response.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { memberId } = await params;
    const body = await request.json();
    const role = typeof body.role === "string" ? body.role : null;

    if (!role) {
      return Response.json({ error: "Rolle ist erforderlich" }, { status: 400 });
    }

    const validRoles = ["ADMIN", "BUILDER", "VIEWER", "APPROVER"];
    if (!validRoles.includes(role)) {
      return Response.json({ error: "Ungültige Rolle" }, { status: 400 });
    }

    const member = await TeamManager.updateRole(memberId, userId, role as RBACRole);

    return Response.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 400 });
  }
}

// DELETE /api/team/members/[memberId] — Mitglied entfernen
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const hasPermission = await RBACManager.checkPermission(userId, "team_members", "delete", userId);
    if (!hasPermission) {
      return Response.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { memberId } = await params;
    await TeamManager.removeMember(memberId, userId);

    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 400 });
  }
}
