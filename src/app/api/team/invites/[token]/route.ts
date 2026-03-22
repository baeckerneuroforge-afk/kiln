import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { TeamManager } from "@/lib/rbac/team-manager";

// POST /api/team/invites/[token] — Einladung annehmen
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Bitte zuerst einloggen" }, { status: 401 });
    }

    const { token } = await params;
    const member = await TeamManager.acceptInvite(token, userId);

    return Response.json({
      member,
      message: "Einladung erfolgreich angenommen",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 400 });
  }
}
