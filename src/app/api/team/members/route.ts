import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { TeamManager } from "@/lib/rbac/team-manager";
import { RBACManager } from "@/lib/rbac/rbac-manager";
import type { RBACRole } from "@/lib/rbac/rbac-manager";

// GET /api/team/members — Liste aller Mitglieder
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const members = await TeamManager.listMembers(userId);

    // Owner immer als erstes hinzufügen (falls nicht als WorkspaceMember gespeichert)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const hasOwner = members.some((m) => m.role === "OWNER");
    if (!hasOwner && user) {
      members.unshift({
        id: "owner",
        userId,
        email: user.email,
        role: "OWNER",
        status: "active",
        inviteToken: null,
        invitedBy: userId,
        joinedAt: null,
        createdAt: new Date(),
      });
    }

    return Response.json({ members });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST /api/team/members — Mitglied einladen
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    // Permission prüfen
    const hasPermission = await RBACManager.checkPermission(userId, "team_members", "create", userId);
    if (!hasPermission) {
      return Response.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role : "BUILDER";

    if (!email) {
      return Response.json({ error: "E-Mail ist erforderlich" }, { status: 400 });
    }

    const validRoles = ["ADMIN", "BUILDER", "VIEWER", "APPROVER"];
    if (!validRoles.includes(role)) {
      return Response.json({ error: "Ungültige Rolle" }, { status: 400 });
    }

    const member = await TeamManager.inviteMember(userId, email, role as RBACRole, userId);

    return Response.json({ member }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 400 });
  }
}
