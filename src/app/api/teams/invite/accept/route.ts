import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      // Redirect to sign-in, then back to this URL
      const url = new URL(request.url);
      const token = url.searchParams.get("token");
      return redirect(`/sign-in?redirect_url=${encodeURIComponent(`/api/teams/invite/accept?token=${token}`)}`);
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return redirect("/dashboard/teams?error=invalid-invite");
    }

    const permission = await prisma.teamPermission.findUnique({
      where: { inviteToken: token },
    });

    if (!permission) {
      return redirect("/dashboard/teams?error=invite-not-found");
    }

    if (permission.status === "REVOKED") {
      return redirect("/dashboard/teams?error=invite-revoked");
    }

    if (permission.status === "ACTIVE") {
      // Already accepted
      return redirect(`/dashboard/teams/${permission.teamId}`);
    }

    // Accept invitation
    await prisma.teamPermission.update({
      where: { id: permission.id },
      data: {
        userId,
        status: "ACTIVE",
        acceptedAt: new Date(),
        inviteToken: null, // Invalidate token
      },
    });

    return redirect(`/dashboard/teams/${permission.teamId}?invite=accepted`);
  } catch (err) {
    console.error("GET /api/teams/invite/accept error:", err);
    return redirect("/dashboard/teams?error=server-error");
  }
}
